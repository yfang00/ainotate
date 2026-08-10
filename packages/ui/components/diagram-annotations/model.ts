import type { DiagramAnnotationTarget } from '../../types';
import type { DiagramPoint, DiagramViewBox } from '../diagramViewport';

export type DiagramRenderer = DiagramAnnotationTarget['renderer'];

export interface DiagramViewportSize {
  width: number;
  height: number;
}

/**
 * The renderer-independent fields needed to restore a saved target. Renderers
 * may carry additional DOM-specific data alongside this structural shape.
 */
export interface DiagramTargetCandidate {
  kind: DiagramAnnotationTarget['kind'];
  semanticKey?: string;
  label?: string;
  ownerLabel?: string;
  anchorSvg: DiagramPoint;
}

export type DiagramTargetResolution =
  | {
    status: 'resolved';
    match: 'semantic' | 'label' | 'positional';
    candidate: DiagramTargetCandidate | null;
    anchor: DiagramPoint;
  }
  | {
    status: 'unresolved';
    reason: 'invalid-anchor' | 'fingerprint-changed';
    candidate: null;
    anchor: null;
  };

const DEFAULT_GESTURE_THRESHOLD = 5;

export function fingerprintDiagramBlock(renderer: DiagramRenderer, source: string): string {
  const input = `${renderer}\u0000${source}`;
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `diagram:${renderer}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function normalizeDiagramPoint(
  point: DiagramPoint,
  naturalBounds: DiagramViewBox,
): DiagramPoint | null {
  if (!isFinitePoint(point) || !isValidViewBox(naturalBounds)) return null;

  return {
    x: clamp((point.x - naturalBounds.x) / naturalBounds.width, 0, 1),
    y: clamp((point.y - naturalBounds.y) / naturalBounds.height, 0, 1),
  };
}

export function projectDiagramAnchor(
  anchor: DiagramPoint,
  naturalBounds: DiagramViewBox,
  appliedViewBox: DiagramViewBox,
  viewport: DiagramViewportSize,
): DiagramPoint | null {
  if (
    !isNormalizedAnchor(anchor)
    || !isValidViewBox(naturalBounds)
    || !isValidViewBox(appliedViewBox)
    || !isValidViewport(viewport)
  ) {
    return null;
  }

  const anchorX = naturalBounds.x + anchor.x * naturalBounds.width;
  const anchorY = naturalBounds.y + anchor.y * naturalBounds.height;
  return {
    x: ((anchorX - appliedViewBox.x) / appliedViewBox.width) * viewport.width,
    y: ((anchorY - appliedViewBox.y) / appliedViewBox.height) * viewport.height,
  };
}

export function classifyDiagramGesture(
  start: DiagramPoint,
  end: DiagramPoint,
  threshold = DEFAULT_GESTURE_THRESHOLD,
): 'click' | 'drag' {
  if (!isFinitePoint(start) || !isFinitePoint(end)) return 'drag';
  const safeThreshold = Number.isFinite(threshold) && threshold >= 0
    ? threshold
    : DEFAULT_GESTURE_THRESHOLD;
  return Math.hypot(end.x - start.x, end.y - start.y) < safeThreshold ? 'click' : 'drag';
}

export function describeDiagramTarget(target: DiagramAnnotationTarget): string {
  const kind = target.kind[0].toUpperCase() + target.kind.slice(1);
  const label = target.kind === 'text'
    ? target.selectedText ?? target.label
    : target.label ?? target.semanticKey;
  const owner = target.kind === 'text' ? target.ownerLabel : undefined;
  const subject = label ? ` “${label}”` : '';
  return `${kind}${subject}${owner ? ` in node “${owner}”` : ''}`;
}

export function resolveDiagramTarget(
  saved: DiagramAnnotationTarget,
  candidates: readonly DiagramTargetCandidate[],
  currentFingerprint: string,
): DiagramTargetResolution {
  if (!isNormalizedAnchor(saved.anchor)) {
    return { status: 'unresolved', reason: 'invalid-anchor', candidate: null, anchor: null };
  }

  const sameKind = candidates.filter((candidate) => candidate.kind === saved.kind);
  if (saved.semanticKey) {
    const semantic = sameKind.find((candidate) => candidate.semanticKey === saved.semanticKey);
    if (semantic) {
      return { status: 'resolved', match: 'semantic', candidate: semantic, anchor: saved.anchor };
    }
  } else {
    const label = targetLabel(saved);
    if (label) {
      const labelMatches = sameKind.filter((candidate) => (
        normalizedText(candidate.label) === normalizedText(label)
        && (!saved.ownerLabel || normalizedText(candidate.ownerLabel) === normalizedText(saved.ownerLabel))
      ));
      if (labelMatches.length === 1) {
        return { status: 'resolved', match: 'label', candidate: labelMatches[0], anchor: saved.anchor };
      }
    }
  }

  if (saved.blockFingerprint === currentFingerprint) {
    return { status: 'resolved', match: 'positional', candidate: null, anchor: saved.anchor };
  }

  return { status: 'unresolved', reason: 'fingerprint-changed', candidate: null, anchor: null };
}

/**
 * Returns the smallest adjustment to the viewBox origin that places an anchor
 * inside the viewport's padded rectangle. Positive values move the viewBox
 * toward the lower/right of the diagram.
 */
export function getPanDeltaToReveal(
  anchor: DiagramPoint,
  appliedViewBox: DiagramViewBox,
  viewport: DiagramViewportSize,
  paddingPx: number,
): DiagramPoint {
  if (!isFinitePoint(anchor) || !isValidViewBox(appliedViewBox) || !isValidViewport(viewport)) {
    return { x: 0, y: 0 };
  }

  const padding = Number.isFinite(paddingPx) ? Math.max(0, paddingPx) : 0;
  const paddingX = Math.min(padding, viewport.width / 2) * appliedViewBox.width / viewport.width;
  const paddingY = Math.min(padding, viewport.height / 2) * appliedViewBox.height / viewport.height;

  return {
    x: revealDelta(anchor.x, appliedViewBox.x + paddingX, appliedViewBox.x + appliedViewBox.width - paddingX),
    y: revealDelta(anchor.y, appliedViewBox.y + paddingY, appliedViewBox.y + appliedViewBox.height - paddingY),
  };
}

function targetLabel(target: DiagramAnnotationTarget): string | undefined {
  return target.kind === 'text' ? target.selectedText ?? target.label : target.label;
}

function normalizedText(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized || undefined;
}

function revealDelta(anchor: number, minimum: number, maximum: number): number {
  if (anchor < minimum) return anchor - minimum;
  if (anchor > maximum) return anchor - maximum;
  return 0;
}

function isNormalizedAnchor(point: DiagramPoint): boolean {
  return isFinitePoint(point) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function isFinitePoint(point: DiagramPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isValidViewBox(viewBox: DiagramViewBox): boolean {
  return (
    Number.isFinite(viewBox.x)
    && Number.isFinite(viewBox.y)
    && Number.isFinite(viewBox.width)
    && Number.isFinite(viewBox.height)
    && viewBox.width > 0
    && viewBox.height > 0
  );
}

function isValidViewport(viewport: DiagramViewportSize): boolean {
  return (
    Number.isFinite(viewport.width)
    && Number.isFinite(viewport.height)
    && viewport.width > 0
    && viewport.height > 0
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
