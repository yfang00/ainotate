import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Annotation, Block, DiagramAnnotationTarget, ImageAttachment } from '../../types';
import { AnnotationType as AnnotationTypeValue } from '../../types';
import { CommentPopover, type CommentAskAIHandler } from '../CommentPopover';
import type { DiagramPoint, DiagramViewBox } from '../diagramViewport';
import { getIdentity } from '../../utils/identity';
import { generateId } from '../../utils/generateId';
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

/** Shared application-owned annotation capabilities accepted by each renderer. */
export interface DiagramBlockAnnotationProps {
  block: Block;
  diagramIndex: number;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  readOnly: boolean;
  allowImages?: boolean;
  onAskAI?: CommentAskAIHandler;
  onAddAnnotation: (annotation: Annotation) => void;
  onSelectAnnotation: (id: string | null) => void;
}

export interface DiagramAnnotationLayerProps extends DiagramBlockAnnotationProps {
  renderer: 'mermaid' | 'graphviz';
  container: HTMLDivElement | null;
  svg: SVGSVGElement | null;
  naturalBounds: DiagramViewBox | null;
  appliedViewBox: DiagramViewBox | null;
  onPanByPixels: (dx: number, dy: number) => boolean;
  onRevealAnchor: (anchor: DiagramPoint) => void;
}

interface PendingPointer {
  pointerId: number;
  start: DiagramPoint;
  last: DiagramPoint;
  candidate: DiagramTargetCandidate | null;
  selectionAtStart: string | null;
  panning: boolean;
}

interface PendingComment {
  candidate: DiagramTargetCandidate;
  target: DiagramAnnotationTarget;
  anchorRect: DOMRect;
  identity: string;
  svg: SVGSVGElement | null;
}

interface RenderedPin {
  annotation: Annotation;
  target: DiagramAnnotationTarget;
  point: DiagramPoint;
  anchorSvg: DiagramPoint | null;
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
  if (!second || first.kind !== second.kind) return false;
  if (first.element === second.element) return true;
  return Boolean(first.semanticKey && second.semanticKey && first.semanticKey === second.semanticKey);
}

function isToolbarOrPin(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('[data-diagram-toolbar], [data-diagram-annotation-pin], [data-diagram-warning-pin]'));
}

function containedSelectionSignature(selection: Selection, svg: SVGSVGElement): string | null {
  if (selection.rangeCount !== 1 || !selection.toString().trim()) return null;
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if (!anchor || !focus || !svg.contains(anchor) || !svg.contains(focus)) return null;
  try {
    const range = selection.getRangeAt(0);
    if (!svg.contains(range.startContainer) || !svg.contains(range.endContainer) || !svg.contains(range.commonAncestorContainer)) return null;
    return `${selection.toString()}\u0000${nodeSignature(anchor, svg)}:${selection.anchorOffset}\u0000${nodeSignature(focus, svg)}:${selection.focusOffset}\u0000${nodeSignature(range.startContainer, svg)}:${range.startOffset}-${nodeSignature(range.endContainer, svg)}:${range.endOffset}`;
  } catch {
    return null;
  }
}

function nodeSignature(node: Node, svg: SVGSVGElement): string {
  const path: number[] = [];
  for (let current: Node | null = node; current && current !== svg; current = current.parentNode) {
    const parent = current.parentNode;
    if (!parent) break;
    path.push(Array.from(parent.childNodes).indexOf(current as ChildNode));
  }
  return path.reverse().join('.');
}

function selectionCandidate(adapter: DiagramAdapter, svg: SVGSVGElement, previous: string | null): DiagramTargetCandidate | null {
  const selection = window.getSelection?.();
  if (!selection) return null;
  const signature = containedSelectionSignature(selection, svg);
  if (!signature || signature === previous) return null;
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

function nearestWarningPoint(point: DiagramPoint, width: number, height: number): DiagramPoint {
  const half = PIN_SIZE / 2;
  const clamped = {
    x: Math.max(half, Math.min(width - half, point.x)),
    y: Math.max(half, Math.min(height - half, point.y)),
  };
  const distances = [
    { side: 'top', distance: clamped.y - half },
    { side: 'left', distance: clamped.x - half },
    { side: 'right', distance: width - half - clamped.x },
    { side: 'bottom', distance: height - half - clamped.y },
  ];
  const side = distances.reduce((closest, candidate) => candidate.distance < closest.distance ? candidate : closest).side;
  if (side === 'top') return { ...clamped, y: half };
  if (side === 'left') return { ...clamped, x: half };
  if (side === 'right') return { ...clamped, x: width - half };
  return { ...clamped, y: height - half };
}

function fallbackWarningPoint(id: string, width: number, height: number): DiagramPoint {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  const side = Math.abs(hash) % 4;
  const half = PIN_SIZE / 2;
  if (side === 0) return { x: half, y: height / 2 };
  if (side === 1) return { x: width - half, y: height / 2 };
  if (side === 2) return { x: width / 2, y: half };
  return { x: width / 2, y: height - half };
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
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const identityFingerprint = fingerprintDiagramBlock(renderer, block.content);
  const boundsIdentity = naturalBounds ? `${naturalBounds.x},${naturalBounds.y},${naturalBounds.width},${naturalBounds.height}` : 'none';
  const diagramIdentity = `${block.id}\u0000${renderer}\u0000${diagramIndex}\u0000${identityFingerprint}\u0000${boundsIdentity}`;
  const diagramIdentityRef = useRef(diagramIdentity);
  const svgRef = useRef(svg);
  diagramIdentityRef.current = diagramIdentity;
  svgRef.current = svg;
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

  useEffect(() => {
    const pending = pendingRef.current;
    if (pending?.panning && container) {
      try { container.releasePointerCapture?.(pending.pointerId); } catch { /* capture may already be lost */ }
    }
    pendingRef.current = null;
    setComment(null);
  }, [block.id, container, diagramIndex, identityFingerprint, boundsIdentity, readOnly, renderer, svg]);

  const openComment = useCallback((candidate: DiagramTargetCandidate) => {
    if (readOnly || !naturalBounds) return;
    const target = candidateToTarget(candidate, renderer, block, diagramIndex, naturalBounds);
    if (!target) return;
    setComment({ candidate, target, anchorRect: candidateRect(candidate), identity: diagramIdentity, svg });
  }, [block, diagramIdentity, diagramIndex, naturalBounds, readOnly, renderer, svg]);

  useEffect(() => {
    if (!container || !svg || !naturalBounds) return undefined;

    const clear = (release = false) => {
      const pending = pendingRef.current;
      if (release && pending?.panning) {
        try { container.releasePointerCapture?.(pending.pointerId); } catch { /* capture may already be lost */ }
      }
      pendingRef.current = null;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isToolbarOrPin(event.target)) return;
      const candidate = readOnly ? null : adapter.resolvePointerTarget(event.target);
      const selection = readOnly ? null : window.getSelection?.();
      pendingRef.current = {
        pointerId: event.pointerId,
        start: pointerPoint(event),
        last: pointerPoint(event),
        candidate,
        selectionAtStart: selection ? containedSelectionSignature(selection, svg) : null,
        panning: false,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;

      // Native SVG word selection is useful context and must take precedence
      // over panning, even where selection movement crosses the pan threshold.
      if (!readOnly && selectionCandidate(adapter, svg, pending.selectionAtStart)) return;
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
      clear(true);

      if (readOnly) return;

      const selected = selectionCandidate(adapter, svg, pending.selectionAtStart);
      if (selected) {
        openComment(selected);
        return;
      }
      if (pending.panning) return;
      const current = adapter.resolvePointerTarget(event.target);
      if (pending.candidate && sameTarget(pending.candidate, current)) openComment(pending.candidate);
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (pendingRef.current?.pointerId === event.pointerId) clear(true);
    };
    const onLostPointerCapture = (event: PointerEvent) => {
      if (pendingRef.current?.pointerId === event.pointerId) clear();
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerCancel);
    container.addEventListener('lostpointercapture', onLostPointerCapture);
    return () => {
      clear(true);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerCancel);
      container.removeEventListener('lostpointercapture', onLostPointerCapture);
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
      const resolution = target.unresolved
        ? { status: 'unresolved' as const }
        : resolveDiagramTarget(target, candidates, fingerprint);
      const restoredAnchor = resolution.status === 'resolved'
        ? resolution.match === 'positional'
          ? resolution.anchor
          : resolution.candidate ? normalizeDiagramPoint(resolution.candidate.anchorSvg, naturalBounds) : null
        : null;
      const point = restoredAnchor
        ? projectDiagramAnchor(restoredAnchor, naturalBounds, appliedViewBox, viewport)
        : null;
      if (!point || resolution.status === 'unresolved' || !restoredAnchor) {
        const savedPoint = projectDiagramAnchor(target.anchor, naturalBounds, appliedViewBox, viewport);
        visible.push({
          annotation, target,
          point: savedPoint
            ? nearestWarningPoint(savedPoint, viewport.width, viewport.height)
            : fallbackWarningPoint(annotation.id, viewport.width, viewport.height),
          anchorSvg: null,
          warning: true,
        });
      } else {
        visible.push({ annotation, target, point, anchorSvg: anchorInDiagramSpace(restoredAnchor, naturalBounds), warning: false });
      }
    }
    return visible;
  }, [adapter, annotations, appliedViewBox, block.id, container, diagramIndex, fingerprint, naturalBounds, renderer, svg]);

  useEffect(() => {
    if (!selectedAnnotationId || !naturalBounds || !appliedViewBox || !container) return;
    const pin = pins.find(({ annotation }) => annotation.id === selectedAnnotationId);
    if (!pin || pin.warning) return;
    container.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const anchor = pin.anchorSvg;
    if (!anchor) return;
    const viewport = container.getBoundingClientRect();
    const delta = getPanDeltaToReveal(anchor, appliedViewBox, viewport, REVEAL_PADDING);
    if (delta.x !== 0 || delta.y !== 0) onRevealAnchor(anchor);
  }, [appliedViewBox, container, naturalBounds, onRevealAnchor, pins, selectedAnnotationId]);

  const submit = useCallback((text: string, images?: ImageAttachment[]) => {
    if (!comment || readOnlyRef.current || comment.identity !== diagramIdentityRef.current || comment.svg !== svgRef.current) return;
    const originalText = comment.target.selectedText ?? describeDiagramTarget(comment.target);
    onAddAnnotation({
      id: generateId('diagram'),
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
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', touchAction: 'pan-y' }}
      >
        {pins.filter(({ point, warning }) => warning || (
          point.x >= 0 && point.x <= (container?.getBoundingClientRect().width ?? 0)
          && point.y >= 0 && point.y <= (container?.getBoundingClientRect().height ?? 0)
        )).map(({ annotation, target, point, warning }) => {
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
