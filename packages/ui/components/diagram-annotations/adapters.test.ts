import { describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { resolveDiagramTarget } from './model';
import {
  graphvizDiagramAdapter,
  mermaidDiagramAdapter,
} from './adapters';

if (typeof document === 'undefined') GlobalRegistrator.register();

const svgNamespace = 'http://www.w3.org/2000/svg';

function diagram(markup: string): SVGSVGElement {
  const container = document.createElement('div');
  container.innerHTML = `<svg xmlns="${svgNamespace}" viewBox="0 0 400 200">${markup}</svg>`;
  return container.querySelector('svg')!;
}

function withBox<T extends SVGGraphicsElement>(element: T, x: number, y: number, width: number, height: number): T {
  Object.defineProperty(element, 'getBBox', {
    value: () => ({ x, y, width, height }),
  });
  return element;
}

function selectionFor(node: Node, text: string): Selection {
  return {
    rangeCount: 1,
    toString: () => text,
    getRangeAt: () => ({ commonAncestorContainer: node }),
  } as unknown as Selection;
}

describe('diagram SVG adapters', () => {
  test('recognizes Mermaid node labels from text and foreignObject without relying on generated ids', () => {
    const svg = diagram(`
      <g class="node generated-unstable" data-id="validate-input"><rect /></g>
      <g class="node" data-id="render-output"><foreignObject><div> Render\n output </div></foreignObject></g>
    `);
    const nodes = [...svg.querySelectorAll<SVGGElement>('g.node')];
    nodes.forEach((node, index) => withBox(node, index * 100, 10, 80, 40));
    const label = document.createElementNS(svgNamespace, 'text');
    label.textContent = ' Validate  input ';
    nodes[0].append(label);

    expect(mermaidDiagramAdapter.listCandidates(svg)).toEqual([
      expect.objectContaining({ kind: 'node', semanticKey: 'node:validate-input', label: 'Validate input', anchorSvg: { x: 40, y: 30 } }),
      expect.objectContaining({ kind: 'node', semanticKey: 'node:render-output', label: 'Render output', anchorSvg: { x: 140, y: 30 } }),
    ]);
  });

  test('recognizes Mermaid edge paths and edge labels', () => {
    const svg = diagram(`
      <g class="edgePath" data-id="validate-to-render"><path class="path" d="M0,0 L100,0" /></g>
      <g class="edgeLabel" data-id="validate-to-render"><text> on success </text></g>
    `);
    const edge = svg.querySelector<SVGGElement>('g.edgePath')!;
    const label = svg.querySelector<SVGGElement>('g.edgeLabel')!;
    withBox(edge, 0, 0, 100, 1);
    withBox(label, 40, 20, 20, 10);

    expect(mermaidDiagramAdapter.resolvePointerTarget(edge.querySelector('path'))).toMatchObject({
      kind: 'edge', semanticKey: 'edge:validate-to-render', anchorSvg: { x: 50, y: 0.5 },
    });
    expect(mermaidDiagramAdapter.resolvePointerTarget(label.querySelector('text'))).toMatchObject({
      kind: 'edge', semanticKey: 'edge:validate-to-render', label: 'on success', anchorSvg: { x: 50, y: 25 },
    });
  });

  test('recognizes Graphviz node and edge groups through title identity', () => {
    const svg = diagram(`
      <g class="node" id="node42"><title>Validate input</title><ellipse /><text> Validate input </text></g>
      <g class="edge" id="edge99"><title>Validate input->Render output</title><path d="M0,0 L100,0" /><text> success </text></g>
    `);
    const node = svg.querySelector<SVGGElement>('g.node')!;
    const edge = svg.querySelector<SVGGElement>('g.edge')!;
    withBox(node, 10, 20, 80, 30);
    withBox(edge, 100, 30, 100, 10);

    expect(graphvizDiagramAdapter.listCandidates(svg)).toEqual([
      expect.objectContaining({ kind: 'node', semanticKey: 'node:Validate input', label: 'Validate input' }),
      expect.objectContaining({ kind: 'edge', semanticKey: 'edge:Validate input->Render output', label: 'success' }),
    ]);
  });

  test('resolves a text selection to text while retaining its semantic node owner', () => {
    const svg = diagram('<g class="node" data-id="validate"><text>Validate input</text></g>');
    const node = withBox(svg.querySelector<SVGGElement>('g.node')!, 10, 20, 80, 30);
    const text = node.querySelector('text')!;

    expect(mermaidDiagramAdapter.resolveTextSelection(selectionFor(text.firstChild!, 'input'))).toMatchObject({
      kind: 'text', semanticKey: 'node:validate', label: 'input', ownerLabel: 'Validate input', anchorSvg: { x: 50, y: 35 },
    });
  });

  test('supplies exact semantic and unique-label candidates after a re-render', () => {
    const first = diagram('<g class="node" data-id="validate"><text>Validate input</text></g>');
    const second = diagram('<g class="node" data-id="validate"><text>Renamed</text></g><g class="node" data-id="unique"><text>Unique</text></g>');
    for (const svg of [first, second]) svg.querySelectorAll<SVGGElement>('g.node').forEach((node) => withBox(node, 0, 0, 20, 20));

    const semanticTarget = {
      renderer: 'mermaid' as const, kind: 'node' as const, semanticKey: 'node:validate', label: 'Validate input',
      anchor: { x: 0.5, y: 0.5 }, blockFingerprint: 'changed', diagramIndex: 0,
    };
    const labelTarget = { ...semanticTarget, semanticKey: undefined, label: 'Unique' };
    const candidates = mermaidDiagramAdapter.listCandidates(second);

    expect(resolveDiagramTarget(semanticTarget, candidates, 'changed')).toMatchObject({ status: 'resolved', match: 'semantic' });
    expect(resolveDiagramTarget(labelTarget, candidates, 'changed')).toMatchObject({ status: 'resolved', match: 'label' });
  });

  test('adds transparent practical edge hit paths and cleans them up idempotently', () => {
    const svg = diagram('<g class="edge" data-id="a-to-b"><path class="visible" d="M0,0 L100,0" stroke="red" stroke-width="1" /></g>');
    const edge = withBox(svg.querySelector<SVGGElement>('g.edge')!, 0, 0, 100, 1);
    const visiblePath = edge.querySelector('path')!;
    const cleanup = mermaidDiagramAdapter.prepare(svg);
    const hitPath = edge.querySelector<SVGPathElement>('path[data-diagram-pointer-hit]')!;

    expect(edge.dataset.diagramCommentable).toBe('edge');
    expect(hitPath).toBeTruthy();
    expect(hitPath.getAttribute('fill')).toBe('none');
    expect(hitPath.getAttribute('stroke')).toBe('transparent');
    expect(hitPath.getAttribute('stroke-width')).toBe('16');
    expect(hitPath.getAttribute('pointer-events')).toBe('stroke');
    expect(visiblePath.getAttribute('stroke')).toBe('red');
    edge.dispatchEvent(new Event('pointerenter'));
    expect(edge.classList.contains('diagram-commentable-hover')).toBe(true);

    cleanup();
    cleanup();
    expect(edge.dataset.diagramCommentable).toBeUndefined();
    expect(edge.querySelector('[data-diagram-pointer-hit]')).toBeNull();
    expect(edge.classList.contains('diagram-commentable-hover')).toBe(false);
    edge.dispatchEvent(new Event('pointerenter'));
    expect(edge.classList.contains('diagram-commentable-hover')).toBe(false);
  });

  test('ignores unknown and background SVG elements', () => {
    const svg = diagram('<rect class="background" width="400" height="200" /><g class="legend"><text>Legend</text></g>');

    expect(mermaidDiagramAdapter.resolvePointerTarget(svg.querySelector('rect'))).toBeNull();
    expect(graphvizDiagramAdapter.resolvePointerTarget(svg.querySelector('text'))).toBeNull();
    expect(mermaidDiagramAdapter.listCandidates(svg)).toEqual([]);
  });
});
