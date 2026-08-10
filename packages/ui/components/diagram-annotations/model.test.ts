import { describe, expect, test } from 'bun:test';
import type { DiagramAnnotationTarget } from '../../types';
import {
  classifyDiagramGesture,
  describeDiagramTarget,
  fingerprintDiagramBlock,
  getPanDeltaToReveal,
  normalizeDiagramPoint,
  projectDiagramAnchor,
  resolveDiagramTarget,
  type DiagramTargetCandidate,
} from './model';

const source = 'flowchart LR\nA-->B';

function makeTarget(overrides: Partial<DiagramAnnotationTarget> = {}): DiagramAnnotationTarget {
  return {
    renderer: 'mermaid',
    kind: 'node',
    semanticKey: 'node:validate',
    label: 'Validate input',
    anchor: { x: 0.25, y: 0.75 },
    blockFingerprint: fingerprintDiagramBlock('mermaid', source),
    diagramIndex: 0,
    ...overrides,
  };
}

describe('diagram annotation model', () => {
  test('fingerprints renderer and source deterministically without crossing renderers', () => {
    const first = fingerprintDiagramBlock('mermaid', source);

    expect(first).toBe(fingerprintDiagramBlock('mermaid', source));
    expect(first).not.toBe(fingerprintDiagramBlock('graphviz', source));
    expect(first).not.toBe(fingerprintDiagramBlock('mermaid', 'flowchart LR\nA-->C'));
  });

  test('normalizes SVG points against natural bounds and clamps points outside them', () => {
    const bounds = { x: 100, y: 200, width: 400, height: 200 };

    expect(normalizeDiagramPoint({ x: 200, y: 250 }, bounds)).toEqual({ x: 0.25, y: 0.25 });
    expect(normalizeDiagramPoint({ x: 900, y: 100 }, bounds)).toEqual({ x: 1, y: 0 });
    expect(normalizeDiagramPoint({ x: 1, y: 1 }, { x: 0, y: 0, width: 0, height: 1 })).toBeNull();
  });

  test('projects normalized anchors through the currently applied viewBox', () => {
    expect(projectDiagramAnchor(
      { x: 0.25, y: 0.75 },
      { x: 100, y: 200, width: 400, height: 200 },
      { x: 150, y: 250, width: 200, height: 100 },
      { width: 800, height: 400 },
    )).toEqual({ x: 200, y: 400 });
  });

  test('distinguishes clicks from drags at the CSS-pixel threshold', () => {
    expect(classifyDiagramGesture({ x: 10, y: 10 }, { x: 13, y: 13 })).toBe('click');
    expect(classifyDiagramGesture({ x: 10, y: 10 }, { x: 13, y: 14 })).toBe('drag');
    expect(classifyDiagramGesture({ x: 10, y: 10 }, { x: 14, y: 13 }, 5)).toBe('drag');
  });

  test('describes node, edge, and text targets for human-facing annotation context', () => {
    expect(describeDiagramTarget(makeTarget())).toBe('Node “Validate input”');
    expect(describeDiagramTarget(makeTarget({ kind: 'edge', label: 'retry' }))).toBe('Edge “retry”');
    expect(describeDiagramTarget(makeTarget({
      kind: 'text',
      selectedText: 'empty payload',
      ownerLabel: 'Validate input',
    }))).toBe('Text “empty payload” in node “Validate input”');
  });

  test('restores a saved target through an exact same-kind semantic key', () => {
    const candidate: DiagramTargetCandidate = {
      kind: 'node',
      semanticKey: 'node:validate',
      label: 'Renamed label',
      anchorSvg: { x: 250, y: 300 },
    };

    expect(resolveDiagramTarget(makeTarget(), [candidate], makeTarget().blockFingerprint)).toMatchObject({
      status: 'resolved',
      match: 'semantic',
      candidate,
      anchor: { x: 0.25, y: 0.75 },
    });
  });

  test('restores a saved target through a unique same-kind label', () => {
    const candidate: DiagramTargetCandidate = {
      kind: 'node',
      label: 'Validate input',
      anchorSvg: { x: 250, y: 300 },
    };

    expect(resolveDiagramTarget(
      makeTarget({ semanticKey: undefined }),
      [candidate],
      makeTarget().blockFingerprint,
    )).toMatchObject({ status: 'resolved', match: 'label', candidate });
  });

  test('uses the normalized anchor only when the fingerprint is unchanged', () => {
    const target = makeTarget({ semanticKey: undefined, label: undefined });

    expect(resolveDiagramTarget(target, [], target.blockFingerprint)).toMatchObject({
      status: 'resolved',
      match: 'positional',
      candidate: null,
      anchor: { x: 0.25, y: 0.75 },
    });
  });

  test('keeps a changed target unresolved when it has no safe semantic match', () => {
    expect(resolveDiagramTarget(makeTarget({ semanticKey: undefined, label: undefined }), [], 'changed')).toMatchObject({
      status: 'unresolved',
      reason: 'fingerprint-changed',
      candidate: null,
    });
  });

  test('keeps malformed persisted anchors unresolved instead of throwing', () => {
    const fingerprint = makeTarget().blockFingerprint;
    const missingAnchor: Partial<DiagramAnnotationTarget> = { ...makeTarget() };
    delete missingAnchor.anchor;
    const malformedTargets: DiagramAnnotationTarget[] = [
      makeTarget({ anchor: { x: Number.NaN, y: 0.75 } }),
      { ...makeTarget(), anchor: null } as unknown as DiagramAnnotationTarget,
      missingAnchor as DiagramAnnotationTarget,
    ];

    for (const persisted of malformedTargets) {
      expect(resolveDiagramTarget(persisted, [], fingerprint))
        .toMatchObject({ status: 'unresolved', reason: 'invalid-anchor', candidate: null });
    }
  });

  test('returns the smallest diagram-space pan needed to reveal an anchor with pin padding', () => {
    const viewBox = { x: 0, y: 0, width: 100, height: 50 };
    const viewport = { width: 200, height: 100 };

    expect(getPanDeltaToReveal({ x: 2, y: 45 }, viewBox, viewport, 10)).toEqual({ x: -3, y: 0 });
    expect(getPanDeltaToReveal({ x: 98, y: 2 }, viewBox, viewport, 10)).toEqual({ x: 3, y: -3 });
    expect(getPanDeltaToReveal({ x: 50, y: 25 }, viewBox, viewport, 10)).toEqual({ x: 0, y: 0 });
  });
});
