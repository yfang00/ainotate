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
const flushSync = (hasDom ? await import('react-dom') : null)!.flushSync;
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
  blockOverride?: Block;
  diagramIndex?: number;
  naturalBounds?: DiagramViewBox;
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
  blockOverride = block,
  diagramIndex = 0,
  naturalBounds = bounds,
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
    Object.defineProperty(svg.querySelector('.keyless')!, 'getBBox', {
      configurable: true,
      value: () => ({ x: 280, y: 120, width: 80, height: 40 }),
    });
    (container as HTMLDivElement & { setPointerCapture: (id: number) => void }).setPointerCapture = () => {};
    setReady(true);
  }, []);

  return (
    <div ref={containerRef} data-testid="viewport" style={{ position: 'relative', width: 400, height: 200 }}>
      <button data-diagram-toolbar type="button">Zoom</button>
      <svg ref={svgRef} viewBox="0 0 400 200">
        <g className="node" data-id="validate"><rect /><text>Validate input</text></g>
        <g className="node keyless"><rect /><text>Untitled node</text></g>
        <g className="edge" data-id="retry"><path d="M140,55 L260,55" /><text>retry</text></g>
        <rect className="background" width="400" height="200" />
      </svg>
      {ready && (
        <DiagramAnnotationLayer
          block={blockOverride}
          renderer="mermaid"
          diagramIndex={diagramIndex}
          container={containerRef.current}
          svg={svgRef.current}
          naturalBounds={naturalBounds}
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

function pointer(type: string, target: Element, x: number, y: number, pointerId = 1, pointerType = 'mouse'): void {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
    pointerId,
    pointerType,
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

async function submitCommentDraftOnly(text: string) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')?.set?.call(textarea, text);
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

async function addManualAttachment(path: string) {
  await act(async () => {
    document.querySelector<HTMLButtonElement>('button[title="Attachments"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  const input = document.querySelector<HTMLInputElement>('input[placeholder="Paste path or URL..."]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
    setter?.call(input, path);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await act(async () => {
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Add')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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

  test.skipIf(!hasDom)('forwards CommentPopover image attachments with the complete diagram annotation shape', async () => {
    const added: Annotation[] = [];
    const originalError = console.error;
    // AttachmentsButton currently renders its clear affordance inside its
    // trigger after an image is added. That unrelated DOM-nesting warning is
    // outside this layer; keep this contract test focused on forwarding.
    console.error = () => {};
    try {
      await mount(<Harness onAdd={(annotation) => added.push(annotation)} />);
      await clickTarget('g.node text');
      await addManualAttachment('/tmp/login-mockup.png');
      await submitComment('Include the mockup');
    } finally {
      console.error = originalError;
    }
    expect(added).toEqual([expect.objectContaining({
      id: expect.stringMatching(/^diagram-/),
      blockId: block.id,
      startOffset: 0,
      endOffset: 0,
      type: AnnotationType.COMMENT,
      text: 'Include the mockup',
      images: [{ path: '/tmp/login-mockup.png', name: 'login-mockup' }],
      diagramTarget: expect.objectContaining({ renderer: 'mermaid', kind: 'node' }),
    })]);
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
    const added: Annotation[] = [];
    await mount(<Harness onAdd={(annotation) => added.push(annotation)} />);
    const text = document.querySelector('g.node text')!;
    let selectionChanged = false;
    window.getSelection = () => selectionChanged ? ({
      rangeCount: 1, toString: () => 'input', anchorNode: text.firstChild, focusNode: text.firstChild,
      anchorOffset: 9, focusOffset: 14,
      getRangeAt: () => ({ commonAncestorContainer: text.firstChild, startContainer: text.firstChild, endContainer: text.firstChild, startOffset: 9, endOffset: 14 }),
    }) as unknown as Selection : ({ rangeCount: 0, toString: () => '' }) as unknown as Selection;
    await act(async () => {
      pointer('pointerdown', text, 60, 40);
      selectionChanged = true;
      pointer('pointermove', text, 90, 40);
      pointer('pointerup', text, 90, 40);
    });
    expect(document.body.textContent).toContain('Text “input” in node “Validate input”');
    await submitComment('Selected words need work');
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      type: AnnotationType.COMMENT,
      blockId: block.id,
      startOffset: 0,
      endOffset: 0,
      originalText: 'input',
      createdA: expect.any(Number),
      author: expect.any(String),
      diagramTarget: {
        kind: 'text', selectedText: 'input', ownerLabel: 'Validate input', semanticKey: 'node:validate',
      },
    });
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
    await mount(<Harness annotations={[exact, unresolved]} selectedAnnotationId="exact" viewBox={{ x: 0, y: 0, width: 200, height: 100 }} onReveal={(point) => reveal.push(point)} />);

    const pin = document.querySelector<HTMLElement>('[data-diagram-annotation-pin="exact"]')!;
    expect(pin.style.left).toBe('168px');
    expect(pin.style.width).toBe('24px');
    expect(document.querySelector('[data-diagram-warning-pin="missing"]')).not.toBeNull();
    expect(reveal).toEqual([]);

    await act(async () => {
      root?.render(<Harness annotations={[exact, unresolved]} selectedAnnotationId="exact" viewBox={bounds} onReveal={(point) => reveal.push(point)} />);
    });
    expect(document.querySelector<HTMLElement>('[data-diagram-annotation-pin="exact"]')!.style.left).toBe('78px');

    await act(async () => root?.unmount());
    root = null;
    expect(document.querySelector('[data-diagram-commentable]')).toBeNull();
  });

  test.skipIf(!hasDom)('keeps pins exposed to assistive technology and warning pins fully inside the boundary', async () => {
    const warning: Annotation = {
      id: 'warning', blockId: block.id, startOffset: 0, endOffset: 0, type: AnnotationType.COMMENT,
      originalText: 'old target', createdA: 1,
      diagramTarget: {
        renderer: 'mermaid', kind: 'edge', semanticKey: 'edge:gone', label: 'gone',
        anchor: { x: 1, y: 1 }, blockFingerprint: 'changed', diagramIndex: 0,
      },
    };
    await mount(<Harness annotations={[warning]} />);
    const pin = document.querySelector<HTMLButtonElement>('[data-diagram-warning-pin="warning"]')!;
    expect(pin.closest('[aria-hidden="true"]')).toBeNull();
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    expect(pin.style.left).toBe('376px');
    expect(pin.style.top).toBe('176px');
  });

  test.skipIf(!hasDom)('uses a matched semantic candidate’s current anchor and reveals resolved targets that are truly offscreen', async () => {
    const reveal: Array<{ x: number; y: number }> = [];
    const semantic: Annotation = {
      id: 'semantic', blockId: block.id, startOffset: 0, endOffset: 0, type: AnnotationType.COMMENT,
      originalText: 'old target', createdA: 1,
      diagramTarget: {
        renderer: 'mermaid', kind: 'node', semanticKey: 'node:validate', label: 'old position',
        anchor: { x: 0.9, y: 0.9 }, blockFingerprint: 'changed', diagramIndex: 0,
      },
    };
    await mount(<Harness annotations={[semantic]} selectedAnnotationId="semantic" onReveal={(anchor) => reveal.push(anchor)} />);
    expect(document.querySelector<HTMLElement>('[data-diagram-annotation-pin="semantic"]')!.style.left).toBe('78px');

    await act(async () => {
      root?.render(<Harness annotations={[semantic]} selectedAnnotationId="semantic" viewBox={{ x: 200, y: 0, width: 100, height: 100 }} onReveal={(anchor) => reveal.push(anchor)} />);
    });
    expect(document.querySelector('[data-diagram-annotation-pin="semantic"]')).toBeNull();
    expect(reveal.at(-1)).toEqual({ x: 90, y: 40 });
  });

  test.skipIf(!hasDom)('pins explicitly unresolved and malformed persisted targets as warnings without resolving them', async () => {
    const annotations: Annotation[] = [
      {
        id: 'explicit', blockId: block.id, startOffset: 0, endOffset: 0, type: AnnotationType.COMMENT,
        originalText: 'old target', createdA: 1,
        diagramTarget: {
          renderer: 'mermaid', kind: 'node', semanticKey: 'node:validate', label: 'Validate input',
          anchor: { x: 0.25, y: 0.2 }, blockFingerprint: block.content, diagramIndex: 0, unresolved: true,
        },
      },
      {
        id: 'malformed', blockId: block.id, startOffset: 0, endOffset: 0, type: AnnotationType.COMMENT,
        originalText: 'old target', createdA: 1,
        diagramTarget: {
          renderer: 'mermaid', kind: 'node', semanticKey: 'node:missing', label: 'missing',
          anchor: { x: Number.NaN, y: 0.2 }, blockFingerprint: 'changed', diagramIndex: 0,
        },
      },
    ];
    await mount(<Harness annotations={annotations} />);
    expect(document.querySelector('[data-diagram-annotation-pin="explicit"]')).toBeNull();
    expect(document.querySelector('[data-diagram-warning-pin="explicit"]')).not.toBeNull();
    expect(document.querySelector('[data-diagram-warning-pin="malformed"]')).not.toBeNull();
  });

  test.skipIf(!hasDom)('keeps background and unknown SVG drags navigable without advertising comments', async () => {
    const pans: Array<[number, number]> = [];
    await mount(<Harness onPan={(dx, dy) => { pans.push([dx, dy]); return true; }} />);
    const background = document.querySelector('rect.background')!;
    await act(async () => {
      pointer('pointerdown', background, 5, 5);
      pointer('pointermove', background, 15, 5);
      pointer('pointerup', background, 15, 5);
    });
    expect(pans).toEqual([[10, 0]]);
    expect(document.querySelector('[data-comment-popover="true"]')).toBeNull();
    expect(background.getAttribute('data-diagram-commentable')).toBeNull();
  });

  test.skipIf(!hasDom)('requires the same physical element for keyless click-release targets', async () => {
    await mount(<Harness />);
    const keyed = document.querySelector('g.node:not(.keyless) text')!;
    const keyless = document.querySelector('g.node.keyless text')!;
    keyed.parentElement!.removeAttribute('data-id');
    await act(async () => {
      pointer('pointerdown', keyed, 60, 40);
      pointer('pointerup', keyless, 300, 140);
    });
    expect(document.querySelector('[data-comment-popover="true"]')).toBeNull();
  });

  test.skipIf(!hasDom)('only accepts a contained SVG selection that changed during this gesture and clears lost capture', async () => {
    await mount(<Harness />);
    const text = document.querySelector('g.node text')!;
    window.getSelection = () => ({
      rangeCount: 1, toString: () => 'input', anchorNode: text.firstChild, focusNode: text.firstChild,
      getRangeAt: () => ({ commonAncestorContainer: text.firstChild }),
    }) as unknown as Selection;
    await act(async () => {
      pointer('pointerdown', text, 60, 40);
      pointer('pointerup', text, 60, 40);
    });
    expect(document.body.textContent).toContain('Node “Validate input”');

    await act(async () => document.querySelector<HTMLButtonElement>('button[title="Close"]')?.click());
    await act(async () => {
      pointer('pointerdown', text, 60, 40);
      pointer('lostpointercapture', text, 60, 40);
      pointer('pointerup', text, 60, 40);
    });
    expect(document.querySelector('[data-comment-popover="true"]')).toBeNull();
  });

  test.skipIf(!hasDom)('rejects cross-boundary selections, releases capture, and treats touch cancellation as non-click', async () => {
    const pans: Array<[number, number]> = [];
    await mount(<Harness onPan={(dx, dy) => { pans.push([dx, dy]); return true; }} />);
    const viewport = document.querySelector<HTMLDivElement>('[data-testid="viewport"]')!;
    const releases: number[] = [];
    viewport.releasePointerCapture = (pointerId) => releases.push(pointerId);
    const text = document.querySelector('g.node text')!;
    const outside = document.createTextNode('outside');
    window.getSelection = () => ({
      rangeCount: 1, toString: () => 'input outside', anchorNode: text.firstChild, focusNode: outside,
      getRangeAt: () => ({ commonAncestorContainer: text.firstChild, startContainer: text.firstChild, endContainer: outside, startOffset: 0, endOffset: 1 }),
    }) as unknown as Selection;
    await act(async () => {
      pointer('pointerdown', text, 60, 40);
      pointer('pointermove', text, 70, 40);
      pointer('pointerup', text, 70, 40);
    });
    expect(pans).toEqual([[10, 0]]);
    expect(releases).toEqual([1]);
    expect(document.querySelector('[data-comment-popover="true"]')).toBeNull();

    window.getSelection = () => ({ rangeCount: 0, toString: () => '' }) as unknown as Selection;
    await act(async () => {
      pointer('pointerdown', text, 60, 40, 2, 'touch');
      pointer('pointercancel', text, 60, 40, 2, 'touch');
      pointer('pointerup', text, 60, 40, 2, 'touch');
    });
    expect(viewport.style.touchAction).toBe('pan-y');
    expect(document.querySelector('[data-comment-popover="true"]')).toBeNull();
  });

  test.skipIf(!hasDom)('closes an editable popover when read-only takes over and blocks a stale submit', async () => {
    const added: Annotation[] = [];
    await mount(<Harness onAdd={(annotation) => added.push(annotation)} />);
    await clickTarget('g.node text');
    expect(document.querySelector('[data-comment-popover="true"]')).not.toBeNull();
    await act(async () => {
      root?.render(<Harness readOnly onAdd={(annotation) => added.push(annotation)} />);
    });
    expect(document.querySelector('[data-comment-popover="true"]')).toBeNull();
    expect(added).toEqual([]);
  });

  test.skipIf(!hasDom)('moves an unresolved stale interior point to its nearest inset boundary', async () => {
    const warning: Annotation = { id: 'interior', blockId: block.id, startOffset: 0, endOffset: 0, type: AnnotationType.COMMENT, originalText: 'old', createdA: 1, diagramTarget: { renderer: 'mermaid', kind: 'edge', semanticKey: 'edge:gone', anchor: { x: 0.5, y: 0.5 }, blockFingerprint: 'changed', diagramIndex: 0 } };
    await mount(<Harness annotations={[warning]} />);
    const pin = document.querySelector<HTMLElement>('[data-diagram-warning-pin="interior"]')!;
    expect(pin.style.left).toBe('188px');
    expect(pin.style.top).toBe('0px');
  });

  test.skipIf(!hasDom)('invalidates an open popover when same-id content or diagram index changes', async () => {
    const added: Annotation[] = [];
    await mount(<Harness onAdd={(annotation) => added.push(annotation)} />);
    await clickTarget('g.node text');
    await act(async () => root?.render(<Harness blockOverride={{ ...block, content: 'changed' }} onAdd={(annotation) => added.push(annotation)} />));
    expect(document.querySelector('[data-comment-popover="true"]')).toBeNull();
    await act(async () => root?.render(<Harness onAdd={(annotation) => added.push(annotation)} />));
    await clickTarget('g.node text');
    await act(async () => root?.render(<Harness diagramIndex={1} onAdd={(annotation) => added.push(annotation)} />));
    expect(document.querySelector('[data-comment-popover="true"]')).toBeNull();
    expect(added).toEqual([]);
  });

  test.skipIf(!hasDom)('preserves an open popover across a value-equivalent naturalBounds allocation', async () => {
    await mount(<Harness />);
    await clickTarget('g.node text');
    expect(document.querySelector('[data-comment-popover="true"]')).not.toBeNull();
    await act(async () => root?.render(<Harness naturalBounds={{ x: 0, y: 0, width: 400, height: 200 }} />));
    expect(document.querySelector('[data-comment-popover="true"]')).not.toBeNull();
  });

  test.skipIf(!hasDom)('synchronously rejects an already-wired submit after a fingerprint change before passive cleanup', async () => {
    const added: Annotation[] = [];
    await mount(<Harness onAdd={(annotation) => added.push(annotation)} />);
    await clickTarget('g.node text');
    await submitCommentDraftOnly('stale');
    const save = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Save')!;
    flushSync(() => root?.render(<Harness blockOverride={{ ...block, content: 'changed' }} onAdd={(annotation) => added.push(annotation)} />));
    save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(added).toEqual([]);
  });
});
