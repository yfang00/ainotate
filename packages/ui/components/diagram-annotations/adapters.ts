import type { DiagramAnnotationTarget } from '../../types';
import type { DiagramPoint } from '../diagramViewport';
import type { DiagramTargetCandidate as ModelDiagramTargetCandidate } from './model';

const COMMENTABLE_ATTRIBUTE = 'data-diagram-commentable';
const POINTER_HIT_ATTRIBUTE = 'data-diagram-pointer-hit';
const HOVER_CLASS = 'diagram-commentable-hover';
const POINTER_STROKE_WIDTH = '16';

/** A renderer candidate together with the SVG element that owns it. */
export interface DiagramTargetCandidate extends ModelDiagramTargetCandidate {
  element: SVGGraphicsElement;
}

export interface DiagramAdapter {
  renderer: DiagramAnnotationTarget['renderer'];
  prepare(svg: SVGSVGElement): () => void;
  resolvePointerTarget(target: EventTarget | null): DiagramTargetCandidate | null;
  resolveTextSelection(selection: Selection): DiagramTargetCandidate | null;
  listCandidates(svg: SVGSVGElement): DiagramTargetCandidate[];
}

type CandidateKind = DiagramAnnotationTarget['kind'];

interface PreparedSvg {
  cleanup(): void;
}

abstract class BaseDiagramAdapter implements DiagramAdapter {
  abstract readonly renderer: DiagramAnnotationTarget['renderer'];
  private readonly prepared = new WeakMap<SVGSVGElement, PreparedSvg>();

  prepare(svg: SVGSVGElement): () => void {
    this.prepared.get(svg)?.cleanup();

    const removals: Array<() => void> = [];
    const hitPaths: SVGPathElement[] = [];
    const candidates = this.listCandidates(svg);

    for (const candidate of candidates) {
      const element = candidate.element;
      element.setAttribute(COMMENTABLE_ATTRIBUTE, candidate.kind);
      const onEnter = () => element.classList.add(HOVER_CLASS);
      const onLeave = () => element.classList.remove(HOVER_CLASS);
      element.addEventListener('pointerenter', onEnter);
      element.addEventListener('pointerleave', onLeave);
      removals.push(() => {
        element.removeAttribute(COMMENTABLE_ATTRIBUTE);
        element.classList.remove(HOVER_CLASS);
        element.removeEventListener('pointerenter', onEnter);
        element.removeEventListener('pointerleave', onLeave);
      });

      if (candidate.kind === 'edge') {
        for (const path of visibleEdgePaths(element)) {
          if (path.hasAttribute(POINTER_HIT_ATTRIBUTE)) continue;
          const hitPath = path.cloneNode(false) as SVGPathElement;
          hitPath.setAttribute(POINTER_HIT_ATTRIBUTE, '');
          hitPath.setAttribute('fill', 'none');
          hitPath.setAttribute('stroke', 'transparent');
          hitPath.setAttribute('stroke-width', POINTER_STROKE_WIDTH);
          hitPath.setAttribute('pointer-events', 'stroke');
          hitPath.setAttribute('aria-hidden', 'true');
          path.parentNode?.appendChild(hitPath);
          hitPaths.push(hitPath);
        }
      }
    }

    let cleaned = false;
    const state: PreparedSvg = {
      cleanup: () => {
        if (cleaned) return;
        cleaned = true;
        for (const remove of removals) remove();
        for (const hitPath of hitPaths) hitPath.remove();
        if (this.prepared.get(svg) === state) this.prepared.delete(svg);
      },
    };
    this.prepared.set(svg, state);
    return state.cleanup;
  }

  resolvePointerTarget(target: EventTarget | null): DiagramTargetCandidate | null {
    const start = targetElement(target);
    if (!start) return null;

    for (let current: Element | null = start; current; current = current.parentElement) {
      const candidate = this.candidateFor(current);
      if (candidate) return candidate;
      if (current instanceof SVGSVGElement) break;
    }
    return null;
  }

  resolveTextSelection(selection: Selection): DiagramTargetCandidate | null {
    const selectedText = normalizeText(selection.toString());
    if (!selectedText || selection.rangeCount === 0) return null;

    const source = selectionSource(selection);
    const owner = source ? this.resolvePointerTarget(source) : null;
    if (!owner || owner.kind === 'text') return null;

    return {
      ...owner,
      element: selectedSvgTextElement(source, owner.element),
      kind: 'text',
      label: selectedText,
      ownerLabel: owner.label,
    };
  }

  listCandidates(svg: SVGSVGElement): DiagramTargetCandidate[] {
    const candidates: DiagramTargetCandidate[] = [];
    const seen = new Set<SVGGraphicsElement>();
    for (const element of svg.querySelectorAll('g, path')) {
      if (!(element instanceof SVGGraphicsElement) || seen.has(element)) continue;
      const candidate = this.candidateFor(element);
      if (candidate) {
        seen.add(element);
        candidates.push(candidate);
      }
    }
    return candidates;
  }

  protected abstract targetKind(element: Element): CandidateKind | null;

  protected semanticIdentity(element: Element): string | undefined {
    return normalizeText(
      element.getAttribute('data-id')
      ?? element.getAttribute('data-node')
      ?? element.getAttribute('id')
      ?? undefined,
    );
  }

  private candidateFor(element: Element): DiagramTargetCandidate | null {
    if (!(element instanceof SVGGraphicsElement)) return null;
    const kind = this.targetKind(element);
    if (!kind) return null;

    const identity = this.semanticIdentity(element);
    const label = visibleLabel(element);
    return {
      element,
      kind,
      semanticKey: identity ? `${kind}:${identity}` : undefined,
      label,
      anchorSvg: svgAnchor(element),
    };
  }
}

class MermaidDiagramAdapter extends BaseDiagramAdapter {
  readonly renderer = 'mermaid' as const;

  protected targetKind(element: Element): CandidateKind | null {
    if (element.localName === 'g' && hasClass(element, 'node')) return 'node';
    if (
      element.localName === 'g'
      && (hasClass(element, 'edge') || hasClass(element, 'edgePath') || hasClass(element, 'edgeLabel'))
    ) return 'edge';
    if (element.localName === 'path' && hasClass(element, 'flowchart-link')) return 'edge';
    return null;
  }
}

class GraphvizDiagramAdapter extends BaseDiagramAdapter {
  readonly renderer = 'graphviz' as const;

  protected targetKind(element: Element): CandidateKind | null {
    if (element.localName !== 'g') return null;
    if (hasClass(element, 'node')) return 'node';
    if (hasClass(element, 'edge')) return 'edge';
    return null;
  }

  protected semanticIdentity(element: Element): string | undefined {
    return normalizeText(element.querySelector(':scope > title')?.textContent) ?? super.semanticIdentity(element);
  }
}

export const mermaidDiagramAdapter: DiagramAdapter = new MermaidDiagramAdapter();
export const graphvizDiagramAdapter: DiagramAdapter = new GraphvizDiagramAdapter();

function hasClass(element: Element, className: string): boolean {
  return element.classList.contains(className);
}

function targetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function selectionSource(selection: Selection): Node | null {
  if (selection.anchorNode) return selection.anchorNode;
  try {
    return selection.getRangeAt(0).commonAncestorContainer;
  } catch {
    return null;
  }
}

function selectedSvgTextElement(source: Node, fallback: SVGGraphicsElement): SVGGraphicsElement {
  for (let current: Element | null = targetElement(source); current; current = current.parentElement) {
    if (current instanceof SVGGraphicsElement && (current.localName === 'text' || current.localName === 'foreignObject')) {
      return current;
    }
    if (current === fallback) break;
  }
  return fallback;
}

function visibleLabel(element: Element): string | undefined {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('title, desc, path, rect, circle, ellipse, polygon, polyline, line, marker').forEach((node) => node.remove());
  return normalizeText(copy.textContent);
}

function normalizeText(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function svgAnchor(element: SVGGraphicsElement): DiagramPoint {
  const box = safeBox(element);
  if (box) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  const path = element.localName === 'path'
    ? element as unknown as SVGPathElement
    : element.querySelector('path');
  const point = path ? pathMidpoint(path) : null;
  return point ?? { x: 0, y: 0 };
}

function safeBox(element: SVGGraphicsElement): { x: number; y: number; width: number; height: number } | null {
  try {
    const box = element.getBBox();
    if ([box.x, box.y, box.width, box.height].every(Number.isFinite)) return box;
  } catch {
    // Some detached SVG elements cannot report a box. The path fallback is safe.
  }
  return null;
}

function pathMidpoint(path: SVGPathElement): DiagramPoint | null {
  try {
    const length = path.getTotalLength();
    if (!Number.isFinite(length)) return null;
    const point = path.getPointAtLength(length / 2);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return { x: point.x, y: point.y };
  } catch {
    return null;
  }
}

function visibleEdgePaths(element: SVGGraphicsElement): SVGPathElement[] {
  const paths = element.localName === 'path'
    ? [element as unknown as SVGPathElement]
    : [...element.querySelectorAll('path')];
  return paths.filter((path) => !path.hasAttribute(POINTER_HIT_ATTRIBUTE));
}
