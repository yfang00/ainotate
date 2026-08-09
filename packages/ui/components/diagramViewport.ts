export interface DiagramViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramPoint {
  x: number;
  y: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const MIN_INITIAL_ZOOM = 2;
const MAX_INITIAL_ZOOM = 4;

export function shouldInitializeDiagramViewport<T extends object>(
  initializedContainer: T | null,
  currentContainer: T,
  manuallyAdjusted: boolean,
): boolean {
  if (initializedContainer === currentContainer) return false;
  return !(manuallyAdjusted && initializedContainer === null);
}

export function parseDiagramViewBox(svgEl: SVGSVGElement): DiagramViewBox | null {
  const raw = svgEl.getAttribute('viewBox');
  return raw ? parseViewBoxValues(raw) : null;
}

export function parseDiagramViewBoxFromMarkup(markup: string): DiagramViewBox | null {
  const viewBoxMatch = markup.match(/viewBox\s*=\s*"([^"]+)"/i);
  if (viewBoxMatch?.[1]) {
    const parsed = parseViewBoxValues(viewBoxMatch[1]);
    if (parsed) return parsed;
  }

  const widthMatch = markup.match(/\bwidth\s*=\s*"([0-9.]+)(?:px|pt)?"/i);
  const heightMatch = markup.match(/\bheight\s*=\s*"([0-9.]+)(?:px|pt)?"/i);
  const width = widthMatch?.[1] ? Number.parseFloat(widthMatch[1]) : NaN;
  const height = heightMatch?.[1] ? Number.parseFloat(heightMatch[1]) : NaN;
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { x: 0, y: 0, width, height };
  }

  return null;
}

function parseViewBoxValues(raw: string): DiagramViewBox | null {
  const values = raw
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number.parseFloat(value));

  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const [x, y, width, height] = values;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

export function fitDiagramBoundsToViewport(
  bounds: DiagramViewBox,
  viewport: ViewportSize,
): DiagramViewBox {
  const viewportWidth = Math.max(viewport.width, 1);
  const viewportHeight = Math.max(viewport.height, 1);
  const contentRatio = bounds.width / bounds.height;
  const viewportRatio = viewportWidth / viewportHeight;

  if (contentRatio > viewportRatio) {
    const targetHeight = bounds.width / viewportRatio;
    const extra = (targetHeight - bounds.height) / 2;
    return {
      x: bounds.x,
      y: bounds.y - extra,
      width: bounds.width,
      height: targetHeight,
    };
  }

  const targetWidth = bounds.height * viewportRatio;
  const extra = (targetWidth - bounds.width) / 2;
  return {
    x: bounds.x - extra,
    y: bounds.y,
    width: targetWidth,
    height: bounds.height,
  };
}

/**
 * Prefer a readable initial scale for large diagrams instead of shrinking the
 * entire graph to fit. The cap keeps enough surrounding context visible while
 * leaving the rest reachable through two-dimensional pan/scroll gestures.
 */
export function getReadableDiagramZoom(base: DiagramViewBox, viewport: ViewportSize): number {
  const viewportWidth = Math.max(viewport.width, 1);
  const viewportHeight = Math.max(viewport.height, 1);
  const naturalScale = Math.max(base.width / viewportWidth, base.height / viewportHeight);
  return Math.max(MIN_INITIAL_ZOOM, Math.min(MAX_INITIAL_ZOOM, naturalScale));
}

export function clampDiagramZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

export function clampDiagramPan(
  base: DiagramViewBox,
  zoom: number,
  pan: DiagramPoint,
): DiagramPoint {
  if (zoom <= 1) return { x: 0, y: 0 };

  const maxX = (base.width - base.width / zoom) / 2;
  const maxY = (base.height - base.height / zoom) / 2;
  return {
    x: Math.max(-maxX, Math.min(maxX, pan.x)),
    y: Math.max(-maxY, Math.min(maxY, pan.y)),
  };
}

export function panDiagramByPixels(
  base: DiagramViewBox,
  zoom: number,
  pan: DiagramPoint,
  viewport: ViewportSize,
  delta: DiagramPoint,
): DiagramPoint {
  const width = Math.max(viewport.width, 1);
  const height = Math.max(viewport.height, 1);
  const scaleX = (base.width / zoom) / width;
  const scaleY = (base.height / zoom) / height;

  return clampDiagramPan(base, zoom, {
    x: pan.x + delta.x * scaleX,
    y: pan.y + delta.y * scaleY,
  });
}

/**
 * Keep the same diagram-space point centered after the fitted base changes,
 * such as when a sidebar opens or the browser window is resized.
 */
export function rebaseDiagramPan(
  currentBase: DiagramViewBox,
  nextBase: DiagramViewBox,
  zoom: number,
  pan: DiagramPoint,
): DiagramPoint {
  const currentCenter = {
    x: currentBase.x + currentBase.width / 2 + pan.x,
    y: currentBase.y + currentBase.height / 2 + pan.y,
  };
  const nextCenter = {
    x: nextBase.x + nextBase.width / 2,
    y: nextBase.y + nextBase.height / 2,
  };

  return clampDiagramPan(nextBase, zoom, {
    x: currentCenter.x - nextCenter.x,
    y: currentCenter.y - nextCenter.y,
  });
}

/**
 * Preserve the diagram point beneath the mouse while changing zoom. This makes
 * wheel zoom feel spatial: the detail under the pointer stays under it instead
 * of every zoom step pulling toward the diagram's center.
 */
export function anchorDiagramZoom(
  base: DiagramViewBox,
  currentZoom: number,
  nextZoom: number,
  pan: DiagramPoint,
  viewport: ViewportSize,
  pointer: DiagramPoint,
): DiagramPoint {
  const width = Math.max(viewport.width, 1);
  const height = Math.max(viewport.height, 1);
  const normalizedX = Math.max(0, Math.min(1, pointer.x / width));
  const normalizedY = Math.max(0, Math.min(1, pointer.y / height));
  const centerX = base.x + base.width / 2;
  const centerY = base.y + base.height / 2;
  const currentWidth = base.width / currentZoom;
  const currentHeight = base.height / currentZoom;
  const currentX = centerX - currentWidth / 2 + pan.x;
  const currentY = centerY - currentHeight / 2 + pan.y;
  const anchorX = currentX + normalizedX * currentWidth;
  const anchorY = currentY + normalizedY * currentHeight;
  const nextWidth = base.width / nextZoom;
  const nextHeight = base.height / nextZoom;

  return clampDiagramPan(base, nextZoom, {
    x: anchorX - normalizedX * nextWidth - (centerX - nextWidth / 2),
    y: anchorY - normalizedY * nextHeight - (centerY - nextHeight / 2),
  });
}

export function applyDiagramView(
  svgEl: SVGSVGElement,
  base: DiagramViewBox,
  zoom: number,
  pan: DiagramPoint,
): void {
  const zoomedWidth = base.width / zoom;
  const zoomedHeight = base.height / zoom;
  const centerX = base.x + base.width / 2;
  const centerY = base.y + base.height / 2;
  const vbX = centerX - zoomedWidth / 2 + pan.x;
  const vbY = centerY - zoomedHeight / 2 + pan.y;
  svgEl.setAttribute('viewBox', `${vbX} ${vbY} ${zoomedWidth} ${zoomedHeight}`);
}
