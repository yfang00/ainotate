/**
 * Consumer-surface contract for Viewer's host props:
 *   - readOnly suppresses the composer entry points (global-comment button,
 *     attachments) while the document still renders
 *   - allowImages threads to CommentPopover, which hides its attach affordance
 * Defaults preserve today's behavior (composer on, images on).
 */
import { afterEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

import { AnnotationType, type Annotation, type Block } from '../types';
import type { DiagramAnnotationLayerProps } from './diagram-annotations/DiagramAnnotationLayer';
import { fingerprintDiagramBlock } from './diagram-annotations/model';

const hasDom = typeof document !== 'undefined';
const diagramLayerProps: DiagramAnnotationLayerProps[] = [];
const realLayerMod = hasDom ? await import('./diagram-annotations/DiagramAnnotationLayer') : null;
const realVizMod = await import('@viz-js/viz');
const RealDiagramAnnotationLayer = realLayerMod?.DiagramAnnotationLayer;
const realVizInstance = realVizMod.instance;

mock.module('mermaid', () => ({
  default: {
    initialize: () => {},
    render: async () => ({
      svg: '<svg viewBox="0 0 100 50"><g class="node" id="flowchart-A-0"><rect width="40" height="20"/><text>Alpha</text></g></svg>',
    }),
  },
}));

mock.module('@viz-js/viz', () => ({
  ...realVizMod,
  instance: async () => {
    const viz = await realVizInstance();
    return new Proxy(viz, {
      get(target, property, receiver) {
        if (property !== 'renderString') return Reflect.get(target, property, receiver);
        return async (source: string, options?: Parameters<typeof viz.renderString>[1]) => {
          if (source === 'digraph { A -> B }' || source === 'digraph { C -> D }') {
            return '<svg viewBox="0 0 100 50"><g class="node"><title>Alpha</title><ellipse/><text>Alpha</text></g></svg>';
          }
          return viz.renderString(source, options);
        };
      },
    });
  },
}));

if (realLayerMod && RealDiagramAnnotationLayer) {
  mock.module('./diagram-annotations/DiagramAnnotationLayer', () => ({
    ...realLayerMod,
    DiagramAnnotationLayer: (props: DiagramAnnotationLayerProps) => {
      diagramLayerProps.push(props);
      return React.createElement(RealDiagramAnnotationLayer, props);
    },
  }));
}

// CI uses this consumer contract as the entry point for the scoped DOM suite.
// Keep the adjacent public theme/menu contracts in that same DOM run without
// requiring workflow-only test-path maintenance.
import './ActionMenu.test';
import './DocBadges.test';
import './ThemeProvider.test';

// Viewer pulls in @plannotator/web-highlighter, whose UMD bundle reads
// `window` at module-eval time and throws under the default DOM-less
// `bun test`. Import lazily so this file loads cleanly when DOM tests are
// skipped; DOM_TESTS=1 supplies a real DOM and the real modules.
const viewerMod = hasDom ? await import('./Viewer') : null;
const Viewer = viewerMod?.Viewer as typeof import('./Viewer')['Viewer'];
const popoverMod = hasDom ? await import('./CommentPopover') : null;
const CommentPopover =
  popoverMod?.CommentPopover as typeof import('./CommentPopover')['CommentPopover'];

const blocks: Block[] = [
  { id: 'b1', type: 'paragraph', content: 'hello world', order: 0, startLine: 1 },
];

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mount(ui: React.ReactElement): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host!);
    root.render(ui);
  });
}

async function settleDiagramRender(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  host?.remove();
  host = null;
  if (hasDom) document.body.innerHTML = '';
  diagramLayerProps.length = 0;
});

const viewerProps = {
  blocks,
  markdown: 'hello world',
  annotations: [],
  onAddAnnotation: () => {},
  onSelectAnnotation: () => {},
  selectedAnnotationId: null,
  mode: 'comment' as const,
  taterMode: false,
  // Host posture: no /api/doc/exists endpoint.
  disableCodePathValidation: true,
};

function globalCommentButton(): Element | null {
  return document.querySelector('button[title="Add global comment"]');
}

function latestLayer(renderer: 'mermaid' | 'graphviz'): DiagramAnnotationLayerProps {
  const props = [...diagramLayerProps].reverse().find((entry) => entry.renderer === renderer);
  if (!props) throw new Error(`No ${renderer} layer render captured`);
  return props;
}

function appliedView(renderer: 'mermaid' | 'graphviz'): string {
  return JSON.stringify(latestLayer(renderer).appliedViewBox);
}

describe('Viewer consumer props', () => {
  test.skipIf(!hasDom)('wires matching annotations and same-renderer occurrence metadata to diagrams', async () => {
    const diagramBlocks: Block[] = [
      { id: 'm1', type: 'code', language: 'mermaid', content: 'flowchart LR\nA-->B', order: 0, startLine: 1 },
      { id: 'g1', type: 'code', language: 'dot', content: 'digraph { A -> B }', order: 1, startLine: 4 },
      { id: 'm2', type: 'code', language: 'mermaid', content: 'flowchart LR\nC-->D', order: 2, startLine: 7 },
      { id: 'g2', type: 'code', language: 'graphviz', content: 'digraph { C -> D }', order: 3, startLine: 10 },
    ];
    const matching = diagramBlocks.map((block, index) => ({
      id: `a${index}`,
      blockId: block.id,
      startOffset: 0,
      endOffset: 0,
      type: AnnotationType.COMMENT,
      text: `comment ${index}`,
      originalText: `target ${index}`,
      createdA: index,
    }));
    const onAddAnnotation = () => {};
    const onSelectAnnotation = () => {};
    const onAskAI = () => {};

    await mount(
      <Viewer
        {...viewerProps}
        blocks={diagramBlocks}
        markdown="diagrams"
        annotations={[...matching, { ...matching[0], id: 'other', blockId: 'not-a-diagram' }]}
        selectedAnnotationId="a2"
        onAddAnnotation={onAddAnnotation}
        onSelectAnnotation={onSelectAnnotation}
        onAskAI={onAskAI}
        allowImages={false}
        readOnly
      />,
    );
    await settleDiagramRender();

    const latestByBlock = new Map<string, DiagramAnnotationLayerProps>();
    for (const props of diagramLayerProps) latestByBlock.set(props.block.id, props);
    const latestRendererProps = diagramBlocks.map(({ id }) => latestByBlock.get(id)!);
    expect(latestRendererProps.map(({ renderer, block, diagramIndex, annotations }) => ({
      renderer,
      blockId: (block as Block).id,
      diagramIndex,
      annotationIds: (annotations as typeof matching).map(({ id }) => id),
    }))).toEqual([
      { renderer: 'mermaid', blockId: 'm1', diagramIndex: 0, annotationIds: ['a0'] },
      { renderer: 'graphviz', blockId: 'g1', diagramIndex: 0, annotationIds: ['a1'] },
      { renderer: 'mermaid', blockId: 'm2', diagramIndex: 1, annotationIds: ['a2'] },
      { renderer: 'graphviz', blockId: 'g2', diagramIndex: 1, annotationIds: ['a3'] },
    ]);
    for (const props of latestRendererProps) {
      expect(props.selectedAnnotationId).toBe('a2');
      expect(props.onAddAnnotation).toBe(onAddAnnotation);
      expect(props.onSelectAnnotation).toBe(onSelectAnnotation);
      expect(props.onAskAI).toBe(onAskAI);
      expect(props.allowImages).toBe(false);
      expect(props.readOnly).toBe(true);
    }
  });

  test.skipIf(!hasDom)('default renders the global-comment composer entry (today’s behavior)', async () => {
    await mount(
      <Viewer
        {...viewerProps}
        onAddGlobalAttachment={() => {}}
        onRemoveGlobalAttachment={() => {}}
      />,
    );
    expect(globalCommentButton()).not.toBeNull();
    expect(document.querySelector('button[title="Attachments"]')).not.toBeNull();
    expect(document.body.textContent).toContain('hello world');
  });

  test.skipIf(!hasDom)('readOnly hides composer entry points but still renders the document', async () => {
    await mount(
      <Viewer
        {...viewerProps}
        readOnly
        onAddGlobalAttachment={() => {}}
        onRemoveGlobalAttachment={() => {}}
      />,
    );
    expect(globalCommentButton()).toBeNull();
    expect(document.querySelector('button[title="Attachments"]')).toBeNull();
    expect(document.body.textContent).toContain('hello world');
  });

  for (const fixture of [
    { renderer: 'mermaid' as const, language: 'mermaid', content: 'flowchart LR\nA-->B' },
    { renderer: 'graphviz' as const, language: 'dot', content: 'digraph { A -> B }' },
  ]) {
    test.skipIf(!hasDom)(`${fixture.renderer} publishes every viewport operation to the annotation layer`, async () => {
      const resizeCallbacks: ResizeObserverCallback[] = [];
      const OriginalResizeObserver = globalThis.ResizeObserver;
      class HarnessResizeObserver {
        constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      globalThis.ResizeObserver = HarnessResizeObserver as unknown as typeof ResizeObserver;
      try {
        const diagramBlock: Block = {
          id: `${fixture.renderer}-viewport`,
          type: 'code',
          language: fixture.language,
          content: fixture.content,
          order: 0,
          startLine: 1,
        };
        await mount(<Viewer {...viewerProps} blocks={[diagramBlock]} markdown={fixture.content} />);
        await settleDiagramRender();

        const initialLayer = latestLayer(fixture.renderer);
        const inlineContainer = initialLayer.container as HTMLDivElement;
        expect(initialLayer.appliedViewBox).not.toBeNull();
        expect(inlineContainer.contains(initialLayer.svg as Node)).toBe(true);
        expect(inlineContainer.querySelector('[data-diagram-annotation-layer]')).not.toBeNull();
        if (fixture.renderer === 'graphviz') expect(inlineContainer.hasAttribute('data-pinpoint-ignore')).toBe(true);
        inlineContainer.getBoundingClientRect = () => new DOMRect(0, 0, 400, 200);
        (initialLayer.svg as SVGSVGElement).getBoundingClientRect = () => new DOMRect(0, 0, 400, 200);

        const initial = appliedView(fixture.renderer);
        await act(async () => {
          const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true });
          Object.defineProperties(wheelEvent, {
            deltaX: { value: 0 },
            deltaY: { value: -100 },
            deltaMode: { value: WheelEvent.DOM_DELTA_PIXEL },
            clientX: { value: 120 },
            clientY: { value: 80 },
          });
          inlineContainer.dispatchEvent(wheelEvent);
        });
        const wheel = appliedView(fixture.renderer);
        expect(wheel).not.toBe(initial);

        await act(async () => {
          inlineContainer.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, button: 0, pointerId: 7, clientX: 20, clientY: 20,
          }));
          inlineContainer.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true, pointerId: 7, clientX: 22, clientY: 22,
          }));
        });
        expect(appliedView(fixture.renderer)).toBe(wheel);

        await act(async () => {
          (latestLayer(fixture.renderer).onPanByPixels as (dx: number, dy: number) => boolean)(20, 12);
        });
        const pan = appliedView(fixture.renderer);
        expect(pan).not.toBe(wheel);

        await act(async () => {
          (document.querySelector('button[title="Fit to view"]') as HTMLButtonElement).click();
        });
        const fit = appliedView(fixture.renderer);
        expect(fit).not.toBe(pan);

        inlineContainer.getBoundingClientRect = () => new DOMRect(0, 0, 300, 100);
        await act(async () => {
          for (const callback of resizeCallbacks) callback([], {} as ResizeObserver);
        });
        const resized = appliedView(fixture.renderer);
        expect(resized).not.toBe(fit);

        await act(async () => {
          (document.querySelector('button[title="Expand diagram"]') as HTMLButtonElement).click();
        });
        await settleDiagramRender();
        const expandedLayer = latestLayer(fixture.renderer);
        expect(expandedLayer.container).not.toBe(inlineContainer);
        expect(expandedLayer.appliedViewBox).not.toBeNull();

        await act(async () => {
          (document.querySelector('button[title="Exit expanded view"]') as HTMLButtonElement).click();
        });
        await settleDiagramRender();
        const collapsedLayer = latestLayer(fixture.renderer);
        expect(collapsedLayer.container).not.toBe(expandedLayer.container);
        expect(collapsedLayer.appliedViewBox).not.toBeNull();

        await act(async () => {
          (document.querySelector('button[title="Show source"]') as HTMLButtonElement).click();
        });
        expect(document.querySelector('[data-diagram-annotation-layer]')).toBeNull();
      } finally {
        globalThis.ResizeObserver = OriginalResizeObserver;
      }
    });

    test.skipIf(!hasDom)(`${fixture.renderer} settles selected edge-anchor reveal at the clamped pan limit`, async () => {
      const OriginalResizeObserver = globalThis.ResizeObserver;
      const originalHtmlRect = HTMLElement.prototype.getBoundingClientRect;
      const originalSvgRect = SVGElement.prototype.getBoundingClientRect;
      class HarnessResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      globalThis.ResizeObserver = HarnessResizeObserver as unknown as typeof ResizeObserver;
      HTMLElement.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100);
      SVGElement.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100);
      try {
        const diagramBlock: Block = {
          id: `${fixture.renderer}-boundary`,
          type: 'code',
          language: fixture.language,
          content: fixture.content,
          order: 0,
          startLine: 1,
        };
        const selected: Annotation = {
          id: `${fixture.renderer}-selected-edge`,
          blockId: diagramBlock.id,
          startOffset: 0,
          endOffset: 0,
          type: AnnotationType.COMMENT,
          originalText: 'boundary target',
          createdA: 1,
          diagramTarget: {
            renderer: fixture.renderer,
            kind: 'node',
            anchor: { x: 0, y: 0.5 },
            blockFingerprint: fingerprintDiagramBlock(fixture.renderer, fixture.content),
            diagramIndex: 0,
          },
        };
        const renderViewer = (selectedAnnotationId: string | null) => (
          <Viewer
            {...viewerProps}
            blocks={[diagramBlock]}
            markdown={fixture.content}
            annotations={[selected]}
            selectedAnnotationId={selectedAnnotationId}
          />
        );

        await mount(renderViewer(null));
        await settleDiagramRender();
        const baseline = latestLayer(fixture.renderer).appliedViewBox;
        expect(baseline).toEqual({ x: 25, y: 12.5, width: 50, height: 25 });
        const start = diagramLayerProps.length;

        await act(async () => {
          root?.render(renderViewer(selected.id));
        });
        await settleDiagramRender();

        const publications: NonNullable<DiagramAnnotationLayerProps['appliedViewBox']>[] = [];
        let previous = baseline;
        for (const props of diagramLayerProps.slice(start)) {
          if (props.renderer !== fixture.renderer || props.block.id !== diagramBlock.id) continue;
          const next = props.appliedViewBox;
          if (next && next !== previous) publications.push(next);
          previous = next;
        }
        expect(publications).toHaveLength(1);
        expect(publications[0]).toEqual({ x: 0, y: 12.5, width: 50, height: 25 });

        const settled = latestLayer(fixture.renderer).appliedViewBox!;
        await act(async () => {
          (document.querySelector('button[title="Zoom in"]') as HTMLButtonElement).click();
        });
        await settleDiagramRender();
        expect(latestLayer(fixture.renderer).appliedViewBox!.width).toBeLessThan(settled.width);
      } finally {
        globalThis.ResizeObserver = OriginalResizeObserver;
        HTMLElement.prototype.getBoundingClientRect = originalHtmlRect;
        SVGElement.prototype.getBoundingClientRect = originalSvgRect;
      }
    });
  }
});

describe('CommentPopover allowImages', () => {
  function makeAnchor(): HTMLElement {
    const el = document.createElement('span');
    el.textContent = 'anchor';
    document.body.appendChild(el);
    return el;
  }
  const popoverProps = {
    contextText: 'ctx',
    isGlobal: true,
    onSubmit: () => {},
    onClose: () => {},
  };

  test.skipIf(!hasDom)('default shows the attach affordance', async () => {
    await mount(<CommentPopover {...popoverProps} anchorEl={makeAnchor()} />);
    expect(document.querySelector('button[title="Attachments"]')).not.toBeNull();
  });

  test.skipIf(!hasDom)('allowImages={false} hides the attach affordance', async () => {
    await mount(<CommentPopover {...popoverProps} anchorEl={makeAnchor()} allowImages={false} />);
    expect(document.querySelector('button[title="Attachments"]')).toBeNull();
  });

  test.skipIf(!hasDom)('submit with allowImages={false} never reports images', async () => {
    const submitted: Array<unknown> = [];
    await mount(
      <CommentPopover
        {...popoverProps}
        anchorEl={makeAnchor()}
        allowImages={false}
        onSubmit={(text, images) => submitted.push({ text, images })}
      />,
    );
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      const proto = Object.getPrototypeOf(textarea);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(textarea, 'a comment');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }),
      );
    });
    expect(submitted).toEqual([{ text: 'a comment', images: undefined }]);
  });
});

// Keep the import shape honest: AnnotationType is part of the tested surface.
void AnnotationType;
