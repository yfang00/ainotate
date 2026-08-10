import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { instance } from '@viz-js/viz';
import { DiagramAnnotationLayer, type DiagramBlockAnnotationProps } from './diagram-annotations/DiagramAnnotationLayer';
import { getPanDeltaToReveal } from './diagram-annotations/model';
import {
  anchorDiagramZoom,
  applyDiagramView,
  clampDiagramPan,
  clampDiagramZoom,
  fitDiagramBoundsToViewport,
  getReadableDiagramZoom,
  panDiagramByPixels,
  parseDiagramViewBox,
  parseDiagramViewBoxFromMarkup,
  rebaseDiagramPan,
  shouldInitializeDiagramViewport,
  type DiagramViewBox,
} from './diagramViewport';

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
type DiagramViewportMode = 'readable' | 'fit' | 'manual';

const GraphvizSvgMarkup = React.memo(({ svg }: { svg: string }) => (
  <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: svg }} />
));

let vizInstancePromise: ReturnType<typeof instance> | null = null;

function getVizInstance() {
  vizInstancePromise ??= instance();
  return vizInstancePromise;
}

export const GraphvizBlock: React.FC<DiagramBlockAnnotationProps> = ({
  block,
  diagramIndex,
  annotations,
  selectedAnnotationId,
  readOnly,
  allowImages,
  onAskAI,
  onAddAnnotation,
  onSelectAnnotation,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [appliedViewBox, setAppliedViewBox] = useState<DiagramViewBox | null>(null);

  const zoomLevelRef = useRef(1);
  const naturalBoundsRef = useRef<DiagramViewBox | null>(null);
  const baseViewBoxRef = useRef<DiagramViewBox | null>(null);
  const initializedContainerRef = useRef<HTMLDivElement | null>(null);
  const viewportModeRef = useRef<DiagramViewportMode>('readable');
  const panOffsetRef = useRef({ x: 0, y: 0 });

  const zoomInBtnRef = useRef<HTMLButtonElement>(null);
  const zoomOutBtnRef = useRef<HTMLButtonElement>(null);
  const zoomDisplayRef = useRef<HTMLSpanElement>(null);

  const publishAppliedView = useCallback((
    svgEl: SVGSVGElement,
    base: DiagramViewBox,
    zoom: number,
    pan: { x: number; y: number },
  ) => {
    const applied = applyDiagramView(svgEl, base, zoom, pan);
    setAppliedViewBox(applied);
    return applied;
  }, []);

  const updateZoom = useCallback((newZoom: number, pointer?: { x: number; y: number }) => {
    const currentZoom = zoomLevelRef.current;
    const nextZoom = clampDiagramZoom(newZoom);

    if (containerRef.current && baseViewBoxRef.current) {
      const svgEl = containerRef.current.querySelector('svg');
      if (svgEl instanceof SVGSVGElement) {
        panOffsetRef.current = pointer
          ? anchorDiagramZoom(
              baseViewBoxRef.current,
              currentZoom,
              nextZoom,
              panOffsetRef.current,
              svgEl.getBoundingClientRect(),
              pointer,
            )
          : clampDiagramPan(baseViewBoxRef.current, nextZoom, panOffsetRef.current);
        publishAppliedView(svgEl, baseViewBoxRef.current, nextZoom, panOffsetRef.current);
        initializedContainerRef.current = containerRef.current;
      }
    }

    zoomLevelRef.current = nextZoom;

    if (zoomInBtnRef.current) zoomInBtnRef.current.disabled = nextZoom >= MAX_ZOOM;
    if (zoomOutBtnRef.current) zoomOutBtnRef.current.disabled = nextZoom <= MIN_ZOOM;
    if (zoomDisplayRef.current) {
      const show = Math.abs(nextZoom - 1) > 0.001;
      zoomDisplayRef.current.textContent = show ? `${Math.round(nextZoom * 100)}%` : '';
      zoomDisplayRef.current.hidden = !show;
    }
  }, [publishAppliedView]);

  const setCurrentViewport = useCallback((mode: Exclude<DiagramViewportMode, 'manual'>) => {
    if (!containerRef.current || !naturalBoundsRef.current) return;

    const svgEl = containerRef.current.querySelector('svg');
    if (!(svgEl instanceof SVGSVGElement)) return;

    const rect = containerRef.current.getBoundingClientRect();
    const fitted = fitDiagramBoundsToViewport(naturalBoundsRef.current, rect);
    viewportModeRef.current = mode;
    baseViewBoxRef.current = fitted;
    panOffsetRef.current = { x: 0, y: 0 };
    updateZoom(mode === 'readable' ? getReadableDiagramZoom(fitted, rect) : 1);
  }, [updateZoom]);

  const fitToCurrentViewport = useCallback(() => {
    setCurrentViewport('fit');
  }, [setCurrentViewport]);

  const ensureCurrentViewport = useCallback(() => {
    if (
      baseViewBoxRef.current
      && initializedContainerRef.current === containerRef.current
    ) return true;
    setCurrentViewport('readable');
    return Boolean(
      baseViewBoxRef.current
      && initializedContainerRef.current === containerRef.current,
    );
  }, [setCurrentViewport]);

  useEffect(() => {
    let cancelled = false;

    const renderDiagram = async () => {
      try {
        const viz = await getVizInstance();
        const renderedSvg = await viz.renderString(block.content, { format: 'svg' });
        const cleaned = renderedSvg
          .replace(/ width="[^"]*"/, ' width="100%"')
          .replace(/ height="[^"]*"/, ' height="100%"')
          .replace(/ style="[^"]*"/, '')
          .replace(/<polygon[^>]*fill="white"[^>]*\/>/, '')
          .replace(/fill="black"/g, 'fill="var(--foreground)"')
          .replace(/fill="#000000"/g, 'fill="var(--foreground)"')
          .replace(/stroke="black"/g, 'stroke="var(--muted-foreground)"')
          .replace(/stroke="#000000"/g, 'stroke="var(--muted-foreground)"')
          .replace(/fill="lightgrey"/g, 'fill="var(--muted)"')
          .replace(/fill="lightgray"/g, 'fill="var(--muted)"');

        if (!cancelled) {
          naturalBoundsRef.current = parseDiagramViewBoxFromMarkup(cleaned);
          setSvg(cleaned);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
          setSvg('');
        }
      }
    };

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [block.content]);

  useEffect(() => {
    zoomLevelRef.current = 1;
    naturalBoundsRef.current = null;
    baseViewBoxRef.current = null;
    initializedContainerRef.current = null;
    panOffsetRef.current = { x: 0, y: 0 };
    viewportModeRef.current = 'readable';
    setAppliedViewBox(null);
    setIsExpanded(false);
  }, [block.content]);

  useEffect(() => {
    if (showSource) {
      setIsExpanded(false);
      return;
    }

    zoomLevelRef.current = 1;
    panOffsetRef.current = { x: 0, y: 0 };
    baseViewBoxRef.current = null;
    initializedContainerRef.current = null;
    viewportModeRef.current = 'readable';
    setAppliedViewBox(null);
  }, [showSource]);

  useEffect(() => {
    if (!isExpanded) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExpanded(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExpanded]);

  useEffect(() => {
    if (!svg || showSource || !containerRef.current) return;

    const currentContainer = containerRef.current;
    const svgEl = currentContainer.querySelector('svg');
    if (!(svgEl instanceof SVGSVGElement)) return;

    svgEl.style.maxWidth = 'none';
    svgEl.style.width = '100%';
    svgEl.style.height = '100%';
    svgEl.style.display = 'block';
    svgEl.style.filter = 'none';
    svgEl.style.willChange = 'auto';
    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('height', '100%');
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    let cancelled = false;
    let initialized = false;

    const applyInitialView = () => {
      if (cancelled || initialized) return;
      if (!shouldInitializeDiagramViewport(
        initializedContainerRef.current,
        currentContainer,
        viewportModeRef.current === 'manual',
      )) {
        initialized = true;
        return;
      }

      try {
        const base = naturalBoundsRef.current ?? parseDiagramViewBox(svgEl);

        if (!base) return;

        initialized = true;
        naturalBoundsRef.current = base;
        setCurrentViewport('readable');
      } catch {
        setError('Failed to measure diagram bounds');
        setSvg('');
      }
    };

    const raf = requestAnimationFrame(() => requestAnimationFrame(applyInitialView));
    const timer = window.setTimeout(applyInitialView, 120);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [isExpanded, setCurrentViewport, showSource, svg]);

  const panViewportByPixels = useCallback((deltaX: number, deltaY: number) => {
    if (!ensureCurrentViewport()) return false;
    if (!containerRef.current || !baseViewBoxRef.current || zoomLevelRef.current <= 1) return false;

    const svgEl = containerRef.current.querySelector('svg');
    if (!(svgEl instanceof SVGSVGElement)) return false;

    const previous = panOffsetRef.current;
    const next = panDiagramByPixels(
      baseViewBoxRef.current,
      zoomLevelRef.current,
      previous,
      svgEl.getBoundingClientRect(),
      { x: deltaX, y: deltaY },
    );
    if (next.x === previous.x && next.y === previous.y) return false;

    viewportModeRef.current = 'manual';
    panOffsetRef.current = next;
    publishAppliedView(svgEl, baseViewBoxRef.current, zoomLevelRef.current, next);
    initializedContainerRef.current = containerRef.current;
    return true;
  }, [ensureCurrentViewport, publishAppliedView]);

  const panAnnotationViewportByPixels = useCallback((deltaX: number, deltaY: number) => (
    panViewportByPixels(-deltaX, -deltaY)
  ), [panViewportByPixels]);

  const revealAnnotationAnchor = useCallback((anchor: { x: number; y: number }) => {
    if (!containerRef.current || !baseViewBoxRef.current || !appliedViewBox) return;
    const svgEl = containerRef.current.querySelector('svg');
    if (!(svgEl instanceof SVGSVGElement)) return;
    const delta = getPanDeltaToReveal(
      anchor,
      appliedViewBox,
      containerRef.current.getBoundingClientRect(),
      24,
    );
    if (delta.x === 0 && delta.y === 0) return;
    viewportModeRef.current = 'manual';
    panOffsetRef.current = clampDiagramPan(baseViewBoxRef.current, zoomLevelRef.current, {
      x: panOffsetRef.current.x + delta.x,
      y: panOffsetRef.current.y + delta.y,
    });
    publishAppliedView(svgEl, baseViewBoxRef.current, zoomLevelRef.current, panOffsetRef.current);
  }, [appliedViewBox, publishAppliedView]);

  useEffect(() => {
    if (showSource || !containerRef.current) return;

    const container = containerRef.current;
    const handleWheel = (event: WheelEvent) => {
      if (event.shiftKey) {
        const horizontalDelta = Math.abs(event.deltaX) > 0.1 ? event.deltaX : event.deltaY;
        if (panViewportByPixels(horizontalDelta, 0)) event.preventDefault();
        return;
      }

      if (Math.abs(event.deltaY) < 0.1) {
        if (Math.abs(event.deltaX) > 0.1 && panViewportByPixels(event.deltaX, 0)) {
          event.preventDefault();
        }
        return;
      }

      if (!ensureCurrentViewport()) return;
      event.preventDefault();
      viewportModeRef.current = 'manual';
      const rect = container.getBoundingClientRect();
      const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? rect.height
          : 1;
      const factor = Math.exp(-event.deltaY * deltaScale * 0.0025);
      updateZoom(zoomLevelRef.current * factor, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [ensureCurrentViewport, isExpanded, panViewportByPixels, showSource, svg, updateZoom]);

  const handleZoomIn = useCallback(() => {
    if (!ensureCurrentViewport()) return;
    viewportModeRef.current = 'manual';
    updateZoom(zoomLevelRef.current + ZOOM_STEP);
  }, [ensureCurrentViewport, updateZoom]);

  const handleZoomOut = useCallback(() => {
    if (!ensureCurrentViewport()) return;
    viewportModeRef.current = 'manual';
    updateZoom(zoomLevelRef.current - ZOOM_STEP);
  }, [ensureCurrentViewport, updateZoom]);

  const handleFitToScreen = useCallback(() => {
    fitToCurrentViewport();
  }, [fitToCurrentViewport]);

  useEffect(() => {
    if (showSource || !containerRef.current || !naturalBoundsRef.current) return;
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (!containerRef.current || !naturalBoundsRef.current) return;

      const svgEl = containerRef.current.querySelector('svg');
      if (!(svgEl instanceof SVGSVGElement)) return;

      if (initializedContainerRef.current !== containerRef.current) {
        ensureCurrentViewport();
        return;
      }

      const mode = viewportModeRef.current;
      if (mode === 'readable' || mode === 'fit') {
        setCurrentViewport(mode);
        return;
      }

      const currentBase = baseViewBoxRef.current;
      if (!currentBase) return;
      const nextBase = fitDiagramBoundsToViewport(
        naturalBoundsRef.current,
        containerRef.current.getBoundingClientRect(),
      );
      baseViewBoxRef.current = nextBase;
      panOffsetRef.current = rebaseDiagramPan(
        currentBase,
        nextBase,
        zoomLevelRef.current,
        panOffsetRef.current,
      );
      publishAppliedView(svgEl, nextBase, zoomLevelRef.current, panOffsetRef.current);
      initializedContainerRef.current = containerRef.current;
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [ensureCurrentViewport, isExpanded, publishAppliedView, setCurrentViewport, showSource, svg]);

  if (error) {
    return (
      <div className="my-5 rounded-lg border border-destructive/30 bg-destructive/5 overflow-hidden">
        <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20 flex items-center gap-2">
          <svg className="w-4 h-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-xs text-destructive font-medium">Graphviz Error</span>
        </div>
        <pre className="p-3 text-xs text-destructive/80 overflow-x-auto">{error}</pre>
        <pre className="p-3 text-xs text-muted-foreground bg-muted/30 border-t border-border/30 overflow-x-auto">
          <code>{block.content}</code>
        </pre>
      </div>
    );
  }

  const controls = (
    <div className={`absolute top-2 right-2 flex flex-col gap-1 items-center z-10 ${isExpanded ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity'}`}>
      <button
        onClick={() => setShowSource(!showSource)}
        className="p-1.5 rounded-md bg-muted/85 hover:bg-muted text-muted-foreground hover:text-foreground"
        title={showSource ? 'Show diagram' : 'Show source'}
      >
        {showSource ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        )}
      </button>

      {!showSource && svg && (
        <>
          <div className="flex w-10 flex-col items-center gap-0.5 bg-muted/85 rounded-md p-0.5">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title={isExpanded ? 'Exit expanded view' : 'Expand diagram'}
              aria-label={isExpanded ? 'Exit expanded view' : 'Expand diagram'}
            >
              {isExpanded ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 10h4V6M18 10h-4V6M6 14h4v4M18 14h-4v4" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
              )}
            </button>

            <button
              ref={zoomInBtnRef}
              onClick={handleZoomIn}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
            </button>

            <button
              onClick={handleFitToScreen}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Fit to view"
              aria-label="Fit to view"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
            </button>

            <button
              ref={zoomOutBtnRef}
              onClick={handleZoomOut}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
            </button>
          </div>

          <span
            ref={zoomDisplayRef}
            hidden
            className="min-w-10 rounded bg-muted/85 px-1 py-0.5 text-[10px] text-center text-muted-foreground tabular-nums leading-tight"
          />
        </>
      )}
    </div>
  );

  const inlineSource = (
    <pre className="rounded-lg text-[13px] overflow-x-auto bg-muted/50 border border-border/30 p-4">
      <code className={`hljs font-mono language-${block.language ?? 'graphviz'}`}>{block.content}</code>
    </pre>
  );

  const interactionHint = !showSource && svg ? (
    <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-md border border-border/70 bg-card/90 px-2 py-1 text-[10px] font-medium text-foreground/80 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      Scroll to zoom · Drag to pan
    </div>
  ) : null;

  const diagramBody = (
    <div
      ref={containerRef}
      data-pinpoint-ignore=""
      className={`relative rounded-xl bg-background border border-border/70 shadow-inner overflow-hidden select-none [&_[data-diagram-commentable=text]]:select-text touch-pan-y cursor-grab ${isExpanded ? 'h-full min-h-0' : 'h-[min(72vh,42rem)] min-h-[22rem]'}`}
      title="Scroll to zoom; drag to pan"
    >
      <GraphvizSvgMarkup svg={svg} />
      <DiagramAnnotationLayer
        block={block}
        renderer="graphviz"
        diagramIndex={diagramIndex}
        container={containerRef.current}
        svg={containerRef.current?.querySelector('svg') instanceof SVGSVGElement
          ? containerRef.current.querySelector('svg') as SVGSVGElement
          : null}
        naturalBounds={naturalBoundsRef.current}
        appliedViewBox={appliedViewBox}
        annotations={annotations}
        selectedAnnotationId={selectedAnnotationId}
        readOnly={readOnly}
        allowImages={allowImages}
        onAskAI={onAskAI}
        onAddAnnotation={onAddAnnotation}
        onSelectAnnotation={onSelectAnnotation}
        onPanByPixels={panAnnotationViewportByPixels}
        onRevealAnchor={revealAnnotationAnchor}
      />
    </div>
  );

  return (
    <>
      <div className="my-5 group relative" data-block-id={block.id}>
        {!isExpanded && controls}
        {!isExpanded && interactionHint}
        {showSource || !svg ? inlineSource : !isExpanded ? diagramBody : <div className="rounded-xl border border-border/30 bg-muted/10 h-[min(72vh,42rem)] min-h-[22rem]" />}
      </div>

      {!showSource && svg && isExpanded && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background/90 backdrop-blur-sm p-4 md:p-6">
          <div className="mx-auto flex h-full max-w-[min(96vw,110rem)] flex-col gap-3">
            <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <span className="truncate">Graphviz diagram</span>
              <button
                onClick={() => setIsExpanded(false)}
                className="rounded-md border border-border/60 bg-card/70 px-2.5 py-1.5 text-foreground hover:bg-card"
              >
                Close
              </button>
            </div>
            <div className="group relative flex-1 min-h-0">
              {controls}
              {interactionHint}
              {diagramBody}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
