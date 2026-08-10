import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Annotation, Block, DiagramAnnotationTarget, ImageAttachment } from '../../types';
import { AnnotationType as AnnotationTypeValue } from '../../types';
import { CommentPopover, type CommentAskAIHandler } from '../CommentPopover';
import type { DiagramPoint, DiagramViewBox } from '../diagramViewport';
import { getIdentity } from '../../utils/identity';
import { graphvizDiagramAdapter, mermaidDiagramAdapter, type DiagramAdapter, type DiagramTargetCandidate } from './adapters';
import {
  classifyDiagramGesture,
  describeDiagramTarget,
  fingerprintDiagramBlock,
  getPanDeltaToReveal,
  normalizeDiagramPoint,
  projectDiagramAnchor,
  resolveDiagramTarget,
} from './model';

export interface DiagramAnnotationLayerProps {
  block: Block;
  renderer: 'mermaid' | 'graphviz';
  diagramIndex: number;
  container: HTMLDivElement | null;
  svg: SVGSVGElement | null;
  naturalBounds: DiagramViewBox | null;
  appliedViewBox: DiagramViewBox | null;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  readOnly: boolean;
  allowImages?: boolean;
  onAskAI?: CommentAskAIHandler;
  onAddAnnotation: (annotation: Annotation) => void;
  onSelectAnnotation: (id: string | null) => void;
  onPanByPixels: (dx: number, dy: number) => boolean;
  onRevealAnchor: (anchor: DiagramPoint) => void;
}

interface PendingPointer {
  pointerId: number;
  start: DiagramPoint;
  last: DiagramPoint;
  candidate: DiagramTargetCandidate;
  panning: boolean;
  cancelled: boolean;
}

interface PendingComment {
  candidate: DiagramTargetCandidate;
  target: DiagramAnnotationTarget;
  anchorRect: DOMRect;
}

interface RenderedPin {
  annotation: Annotation;
  target: DiagramAnnotationTarget;
  point: DiagramPoint;
  warning: boolean;
}

const GESTURE_THRESHOLD = 5;
const PIN_SIZE = 24;
const REVEAL_PADDING = 24;

function adapterFor(renderer: DiagramAnnotationLayerProps['renderer']): DiagramAdapter {
  return renderer === 'mermaid' ? mermaidDiagramAdapter : graphvizDiagramAdapter;
}

function pointerPoint(event: PointerEvent): DiagramPoint {
  return { x: event.clientX, y: event.clientY };
}

function sameTarget(first: DiagramTargetCandidate, second: DiagramTargetCandidate | null): boolean {
  return Boolean(second && first.kind === second.kind && first.semanticKey === second.semanticKey);
}

function isToolbarOrPin(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('[data-diagram-toolbar], [data-diagram-annotation-pin], [data-diagram-warning-pin]'));
}

function selectionCandidate(adapter: DiagramAdapter, svg: SVGSVGElement): DiagramTargetCandidate | null {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) return null;
  const anchor = selection.anchorNode;
  if (!anchor || !svg.contains(anchor)) return null;
  return adapter.resolveTextSelection(selection);
}

function candidateToTarget(
  candidate: DiagramTargetCandidate,
  renderer: DiagramAnnotationLayerProps['renderer'],
  block: Block,
  diagramIndex: number,
  naturalBounds: DiagramViewBox,
): DiagramAnnotationTarget | null {
  const anchor = normalizeDiagramPoint(candidate.anchorSvg, naturalBounds);
  if (!anchor) return null;
  return {
    renderer,
    kind: candidate.kind,
    semanticKey: candidate.semanticKey,
    label: candidate.label,
    ownerLabel: candidate.ownerLabel,
    ...(candidate.kind === 'text' && candidate.label ? { selectedText: candidate.label } : {}),
    anchor,
    blockFingerprint: fingerprintDiagramBlock(renderer, block.content),
    diagramIndex,
  };
}

function candidateRect(candidate: DiagramTargetCandidate): DOMRect {
  const rect = candidate.element.getBoundingClientRect();
  if (Number.isFinite(rect.left) && Number.isFinite(rect.top)) return rect;
  return new DOMRect(0, 0, 1, 1);
}

function anchorInDiagramSpace(anchor: DiagramPoint, naturalBounds: DiagramViewBox): DiagramPoint {
  return {
    x: naturalBounds.x + anchor.x * naturalBounds.width,
    y: naturalBounds.y + anchor.y * naturalBounds.height,
  };
}

function clampToViewport(point: DiagramPoint, width: number, height: number): DiagramPoint {
  return {
    x: Math.max(0, Math.min(width, point.x)),
    y: Math.max(0, Math.min(height, point.y)),
  };
}

/**
 * Renderer-independent comment interaction and pin overlay for a rendered SVG.
 * The renderer remains responsible for zoom and wheel navigation; this layer
 * only claims a pointer once it becomes a commentable drag.
 */
export function DiagramAnnotationLayer({
  block,
  renderer,
  diagramIndex,
  container,
  svg,
  naturalBounds,
  appliedViewBox,
  annotations,
  selectedAnnotationId,
  readOnly,
  allowImages = true,
  onAskAI,
  onAddAnnotation,
  onSelectAnnotation,
  onPanByPixels,
  onRevealAnchor,
}: DiagramAnnotationLayerProps) {
  const adapter = useMemo(() => adapterFor(renderer), [renderer]);
  const pendingRef = useRef<PendingPointer | null>(null);
  const idCounterRef = useRef(0);
  const [comment, setComment] = useState<PendingComment | null>(null);

  // Affordances are deliberately absent in read-only mode, where the SVG is
  // navigation-only. Existing pins still render below.
  useEffect(() => {
    if (readOnly || !svg) return undefined;
    return adapter.prepare(svg);
  }, [adapter, readOnly, svg]);

  useEffect(() => {
    if (!container) return undefined;
    const previousTouchAction = container.style.touchAction;
    container.style.touchAction = 'pan-y';
    return () => { container.style.touchAction = previousTouchAction; };
  }, [container]);

  const openComment = useCallback((candidate: DiagramTargetCandidate) => {
    if (readOnly || !naturalBounds) return;
    const target = candidateToTarget(candidate, renderer, block, diagramIndex, naturalBounds);
    if (!target) return;
    setComment({ candidate, target, anchorRect: candidateRect(candidate) });
  }, [block, diagramIndex, naturalBounds, readOnly, renderer]);

  useEffect(() => {
    if (readOnly || !container || !svg || !naturalBounds) return undefined;

    const clear = () => { pendingRef.current = null; };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isToolbarOrPin(event.target)) return;
      const candidate = adapter.resolvePointerTarget(event.target);
      if (!candidate) return;
      pendingRef.current = {
        pointerId: event.pointerId,
        start: pointerPoint(event),
        last: pointerPoint(event),
        candidate,
        panning: false,
        cancelled: false,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== event.pointerId || pending.cancelled) return;

      // Native SVG word selection is useful context and must take precedence
      // over panning, even where selection movement crosses the pan threshold.
      if (selectionCandidate(adapter, svg)) return;
      const next = pointerPoint(event);
      if (!pending.panning && classifyDiagramGesture(pending.start, next, GESTURE_THRESHOLD) === 'drag') {
        pending.panning = true;
        container.setPointerCapture?.(event.pointerId);
      }
      if (!pending.panning) return;
      event.preventDefault();
      onPanByPixels(next.x - pending.last.x, next.y - pending.last.y);
      pending.last = next;
    };
    const onPointerUp = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      pendingRef.current = null;
      if (pending.cancelled) return;

      const selected = selectionCandidate(adapter, svg);
      if (selected) {
        openComment(selected);
        return;
      }
      if (pending.panning) return;
      const current = adapter.resolvePointerTarget(event.target);
      if (sameTarget(pending.candidate, current)) openComment(pending.candidate);
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (pendingRef.current?.pointerId === event.pointerId) clear();
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerCancel);
    return () => {
      clear();
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [adapter, container, naturalBounds, onPanByPixels, openComment, readOnly, svg]);

  const fingerprint = useMemo(() => fingerprintDiagramBlock(renderer, block.content), [block.content, renderer]);
  const pins = useMemo((): RenderedPin[] => {
    if (!svg || !container || !naturalBounds || !appliedViewBox) return [];
    const viewport = container.getBoundingClientRect();
    if (viewport.width <= 0 || viewport.height <= 0) return [];
    const candidates = adapter.listCandidates(svg);
    const visible: RenderedPin[] = [];

    for (const annotation of annotations) {
      const target = annotation.diagramTarget;
      if (!target || annotation.blockId !== block.id || target.renderer !== renderer || target.diagramIndex !== diagramIndex) continue;
      const resolution = resolveDiagramTarget(target, candidates, fingerprint);
      const anchor = resolution.status === 'resolved' ? resolution.anchor : target.anchor;
      const point = projectDiagramAnchor(anchor, naturalBounds, appliedViewBox, viewport);
      if (!point) continue;
      if (resolution.status === 'unresolved') {
        visible.push({ annotation, target, point: clampToViewport(point, viewport.width, viewport.height), warning: true });
      } else if (point.x >= 0 && point.x <= viewport.width && point.y >= 0 && point.y <= viewport.height) {
        visible.push({ annotation, target, point, warning: false });
      }
    }
    return visible;
  }, [adapter, annotations, appliedViewBox, block.id, container, diagramIndex, fingerprint, naturalBounds, renderer, svg]);

  useEffect(() => {
    if (!selectedAnnotationId || !naturalBounds || !appliedViewBox || !container) return;
    const pin = pins.find(({ annotation }) => annotation.id === selectedAnnotationId);
    if (!pin || pin.warning) return;
    container.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const anchor = anchorInDiagramSpace(pin.target.anchor, naturalBounds);
    const viewport = container.getBoundingClientRect();
    const delta = getPanDeltaToReveal(anchor, appliedViewBox, viewport, REVEAL_PADDING);
    if (delta.x !== 0 || delta.y !== 0) onRevealAnchor(anchor);
  }, [appliedViewBox, container, naturalBounds, onRevealAnchor, pins, selectedAnnotationId]);

  const submit = useCallback((text: string, images?: ImageAttachment[]) => {
    if (!comment) return;
    const originalText = describeDiagramTarget(comment.target);
    idCounterRef.current += 1;
    onAddAnnotation({
      id: `diagram-${Date.now()}-${idCounterRef.current}`,
      blockId: block.id,
      startOffset: 0,
      endOffset: 0,
      type: AnnotationTypeValue.COMMENT,
      text: text.trim(),
      originalText,
      createdA: Date.now(),
      author: getIdentity(),
      images,
      diagramTarget: comment.target,
    });
    setComment(null);
  }, [block.id, comment, onAddAnnotation]);

  return (
    <>
      <div
        data-diagram-annotation-layer="true"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', touchAction: 'pan-y' }}
      >
        {pins.map(({ annotation, target, point, warning }) => {
          const left = Math.round(point.x - PIN_SIZE / 2);
          const top = Math.round(point.y - PIN_SIZE / 2);
          const label = warning
            ? `Diagram target changed for annotation ${annotation.id}`
            : `Annotation ${annotation.id}: ${describeDiagramTarget(target)}`;
          return (
            <button
              key={annotation.id}
              type="button"
              data-diagram-annotation-pin={warning ? undefined : annotation.id}
              data-diagram-warning-pin={warning ? annotation.id : undefined}
              aria-label={label}
              aria-pressed={selectedAnnotationId === annotation.id}
              title={label}
              onClick={() => onSelectAnnotation(annotation.id)}
              style={{
                position: 'absolute', left, top, width: PIN_SIZE, height: PIN_SIZE,
                pointerEvents: 'auto', borderRadius: '9999px', border: '1px solid var(--primary)',
                background: warning ? 'var(--warning, #d97706)' : 'var(--primary)',
                color: 'var(--primary-foreground, white)', fontSize: 12, lineHeight: '22px', padding: 0,
              }}
            >
              {warning ? '!' : '●'}
            </button>
          );
        })}
      </div>
      {comment && (
        <CommentPopover
          anchorRect={comment.anchorRect}
          contextText={describeDiagramTarget(comment.target)}
          isGlobal={false}
          allowImages={allowImages}
          onAskAI={onAskAI}
          askAIContext={{
            kind: 'selection',
            label: describeDiagramTarget(comment.target),
            text: comment.target.selectedText ?? comment.target.label,
          }}
          onSubmit={submit}
          onClose={() => setComment(null)}
        />
      )}
    </>
  );
}
