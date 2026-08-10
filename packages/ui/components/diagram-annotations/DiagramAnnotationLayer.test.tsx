import { afterEach, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

if (typeof document === 'undefined') GlobalRegistrator.register();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import type React from 'react';
import type { Root } from 'react-dom/client';
import { AnnotationType, type Annotation, type Block } from '../../types';
import type { DiagramViewBox } from '../diagramViewport';

const hasDom = typeof document !== 'undefined';
// React DOM decides which input-event implementation to use when it loads, so
// load it only after happy-dom has installed window/document.
const react = hasDom ? await import('react') : null;
const { act, useLayoutEffect, useRef, useState } = react!;
const reactDom = hasDom ? await import('react-dom/client') : null;
const createRoot = reactDom!.createRoot;
const layerModule = hasDom ? await import('./DiagramAnnotationLayer') : null;
const DiagramAnnotationLayer = layerModule?.DiagramAnnotationLayer as typeof import('./DiagramAnnotationLayer')['DiagramAnnotationLayer'];

const block: Block = {
  id: 'diagram-block',
  type: 'code',
  language: 'mermaid',
  content: 'flowchart LR\nA[Validate input] -->|retry| B[Render output]',
  order: 0,
  startLine: 1,
};

const bounds: DiagramViewBox = { x: 0, y: 0, width: 400, height: 200 };
let root: Root | null = null;
let host: HTMLElement | null = null;

interface HarnessProps {
  annotations?: Annotation[];
  selectedAnnotationId?: string | null;
  readOnly?: boolean;
  viewBox?: DiagramViewBox;
  onAdd?: (annotation: Annotation) => void;
  onSelect?: (id: string | null) => void;
  onPan?: (dx: number, dy: number) => boolean;
  onReveal?: (anchor: { x: number; y: number }) => void;
}

function Harness({
  annotations = [],
  selectedAnnotationId = null,
  readOnly = false,
  viewBox = bounds,
  onAdd = () => {},
  onSelect = () => {},
  onPan = () => true,
  onReveal = () => {},
}: HarnessProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const svg = svgRef.current!;
    const container = containerRef.current!;
    Object.defineProperty(container, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(10, 20, 400, 200),
    });
    Object.defineProperty(svg.querySelector('.node')!, 'getBBox', {
      configurable: true,
      value: () => ({ x: 40, y: 20, width: 100, height: 40 }),
    });
    Object.defineProperty(svg.querySelector('.edge')!, 'getBBox', {
      configurable: true,
      value: () => ({ x: 140, y: 50, width: 120, height: 10 }),
    });
    (container as HTMLDivElement & { setPointerCapture: (id: number) => void }).setPointerCapture = () => {};
    setReady(true);
  }, []);

  return (
    <div ref={containerRef} data-testid="viewport" style={{ position: 'relative', width: 400, height: 200 }}>
      <button data-diagram-toolbar type="button">Zoom</button>
      <svg ref={svgRef} viewBox="0 0 400 200">
        <g className="node" data-id="validate"><rect /><text>Validate input</text></g>
        <g className="edge" data-id="retry"><path d="M140,55 L260,55" /><text>retry</text></g>
        <rect className="background" width="400" height="200" />
      </svg>
      {ready && (
        <DiagramAnnotationLayer
          block={block}
          renderer="mermaid"
          diagramIndex={0}
          container={containerRef.current}
          svg={svgRef.current}
          naturalBounds={bounds}
          appliedViewBox={viewBox}
          annotations={annotations}
          selectedAnnotationId={selectedAnnotationId}
          readOnly={readOnly}
          onAddAnnotation={onAdd}
          onSelectAnnotation={onSelect}
          onPanByPixels={onPan}
          onRevealAnchor={onReveal}
        />
      )}
    </div>
  );
}

async function mount(ui: React.ReactElement) {
  host = document.createElement('div');
  document.body.append(host);
  await act(async () => {
    root = createRoot(host!);
    root.render(ui);
  });
}

function pointer(type: string, target: Element, x: number, y: number, pointerId = 1): void {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
    pointerId,
    pointerType: 'mouse',
  }));
}

async function clickTarget(selector: string) {
  const target = document.querySelector(selector)!;
  await act(async () => {
    pointer('pointerdown', target, 60, 40);
    pointer('pointerup', target, 60, 40);
  });
}

async function submitComment(text = 'Please reconsider') {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')?.set;
    setter?.call(textarea, text);
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const save = [...document.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === 'Save') as HTMLButtonElement | undefined;
  expect(save?.disabled).toBe(false);
  await act(async () => {
    save?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  window.getSelection = document.getSelection.bind(document);
  document.body.innerHTML = '';
});

describe('DiagramAnnotationLayer', () => {
  test.skipIf(!hasDom)('opens the existing comment popover for a node click and saves a normal COMMENT annotation', async () => {
    const added: Annotation[] = [];
    await mount(<Harness onAdd={(annotation) => added.push(annotation)} />);

    await clickTarget('g.node text');
    expect(document.querySelector('[data-comment-popover="true"]')).not.toBeNull();

    await submitComment();
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      blockId: block.id,
      type: AnnotationType.COMMENT,
      text: 'Please reconsider',
      originalText: 'Node “Validate input”',
      author: expect.any(String),
      createdA: expect.any(Number),
      diagramTarget: {
        renderer: 'mermaid', kind: 'node', semanticKey: 'node:validate',
        label: 'Validate input', diagramIndex: 0,
      },
    });
  });

  test.skipIf(!hasDom)('treats edge clicks and sub-threshold movement as comments', async () => {
    await mount(<Harness />);
    const edge = document.querySelector('g.edge text')!;
    await act(async () => {
      pointer('pointerdown', edge, 170, 55);
      pointer('pointermove', edge, 173, 58);
      pointer('pointerup', edge, 173, 58);
    });
    expect(document.body.textContent).toContain('Edge “retry”');
  });

  test.skipIf(!hasDom)('pans at the movement threshold and never opens a comment', async () => {
    const pans: Array<[number, number]> = [];
    await mount(<Harness onPan={(dx, dy) => { pans.push([dx, dy]); return true; }} />);
    const node = document.querySelector('g.node text')!;
    await act(async () => {
      pointer('pointerdown', node, 60, 40);
      pointer('pointermove', node, 63, 44);
      pointer('pointerup', node, 63, 44);
    });
    expect(pans).toEqual([[3, 4]]);
    expect(document.querySelector('[data-comment-popover="true"]')).toBeNull();
  });

  test.skipIf(!hasDom)('lets a valid SVG text selection win over a drag and preserves its node context', async () => {
    await mount(<Harness />);
    const text = document.querySelector('g.node text')!;
    window.getSelection = () => ({
      rangeCount: 1,
      toString: () => 'input',
      anchorNode: text.firstChild,
      getRangeAt: () => ({ commonAncestorContainer: text.firstChild }),
    }) as unknown as Selection;
    await act(async () => {
      pointer('pointerdown', text, 60, 40);
      pointer('pointermove', text, 90, 40);
      pointer('pointerup', text, 90, 40);
    });
    expect(document.body.textContent).toContain('Text “input” in node “Validate input”');
  });

  test.skipIf(!hasDom)('does not interfere with wheel events or read-only navigation, but read-only pins remain selectable', async () => {
    const selected: Array<string | null> = [];
    const annotation: Annotation = {
      id: 'saved', blockId: block.id, startOffset: 0, endOffset: 0,
      type: AnnotationType.COMMENT, originalText: 'Node “Validate input”', createdA: 1,
      diagramTarget: {
        renderer: 'mermaid', kind: 'node', semanticKey: 'node:validate', label: 'Validate input',
        anchor: { x: 0.25, y: 0.2 }, blockFingerprint: 'diagram:mermaid:9e8d4c67', diagramIndex: 0,
      },
    };
    await mount(<Harness readOnly annotations={[annotation]} onSelect={(id) => selected.push(id)} />);
    const node = document.querySelector('g.node text')!;
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 10 });
    node.dispatchEvent(wheel);
    await clickTarget('g.node text');
    expect(wheel.defaultPrevented).toBe(false);
    expect(document.querySelector('[data-comment-popover="true"]')).toBeNull();
    const pin = document.querySelector<HTMLButtonElement>('[data-diagram-annotation-pin="saved"]')!;
    expect(pin.getAttribute('aria-label')).toContain('Node');
    pin.click();
    expect(selected).toEqual(['saved']);
  });

  test.skipIf(!hasDom)('renders unresolved targets at the boundary, projects pins, reveals selected offscreen anchors, and cleans adapter affordances', async () => {
    const reveal: Array<{ x: number; y: number }> = [];
    const saved = (id: string, target: Annotation['diagramTarget']): Annotation => ({
      id, blockId: block.id, startOffset: 0, endOffset: 0, type: AnnotationType.COMMENT,
      originalText: 'old target', createdA: 1, diagramTarget: target,
    });
    const exact = saved('exact', {
      renderer: 'mermaid', kind: 'node', semanticKey: 'node:validate', label: 'Validate input',
      anchor: { x: 0.25, y: 0.2 }, blockFingerprint: 'changed', diagramIndex: 0,
    });
    const unresolved = saved('missing', {
      renderer: 'mermaid', kind: 'edge', semanticKey: 'edge:gone', label: 'gone',
      anchor: { x: 0.9, y: 0.5 }, blockFingerprint: 'changed', diagramIndex: 0,
    });
    await mount(<Harness annotations={[exact, unresolved]} selectedAnnotationId="exact" viewBox={{ x: 100, y: 0, width: 200, height: 100 }} onReveal={(point) => reveal.push(point)} />);

    const pin = document.querySelector<HTMLElement>('[data-diagram-annotation-pin="exact"]')!;
    expect(pin.style.left).toBe('-12px');
    expect(pin.style.width).toBe('24px');
    expect(document.querySelector('[data-diagram-warning-pin="missing"]')).not.toBeNull();
    expect(reveal).toEqual([{ x: 100, y: 40 }]);

    await act(async () => {
      root?.render(<Harness annotations={[exact, unresolved]} selectedAnnotationId="exact" viewBox={bounds} onReveal={(point) => reveal.push(point)} />);
    });
    expect(document.querySelector<HTMLElement>('[data-diagram-annotation-pin="exact"]')!.style.left).toBe('88px');

    await act(async () => root?.unmount());
    root = null;
    expect(document.querySelector('[data-diagram-commentable]')).toBeNull();
  });
});
