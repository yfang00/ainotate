/**
 * The diagram-target sidecar is an OPTIONAL parallel array on SharePayload.
 * The compact annotation tuples never change shape, so links written before
 * diagram comments existed still open, and links written after them still open
 * in readers that predate the sidecar.
 */
import { describe, expect, test } from 'bun:test';
import { AnnotationType, type Annotation, type DiagramAnnotationTarget } from '../types';
import {
  applyDiagramTargetArray,
  buildDiagramTargetArray,
  fromShareable,
  toShareable,
  type ShareableAnnotation,
} from './sharing';

const target: DiagramAnnotationTarget = {
  renderer: 'mermaid',
  kind: 'node',
  semanticKey: 'node:validate',
  label: 'Validate input',
  anchor: { x: 0.25, y: 0.75 },
  blockFingerprint: 'diagram:mermaid:0000abcd',
  diagramIndex: 0,
};

function comment(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'a1',
    blockId: 'diagram-1',
    startOffset: 0,
    endOffset: 0,
    type: AnnotationType.COMMENT,
    text: 'reject empty payloads',
    originalText: 'Node “Validate input”',
    createdA: 1,
    ...overrides,
  };
}

describe('buildDiagramTargetArray', () => {
  test('returns null when no annotation carries a target', () => {
    expect(buildDiagramTargetArray([comment(), comment({ id: 'a2' })])).toBeNull();
  });

  test('pads non-diagram positions with null so the sidecar stays parallel', () => {
    const built = buildDiagramTargetArray([
      comment({ id: 'plain' }),
      comment({ id: 'pinned', diagramTarget: target }),
      comment({ id: 'plain-2' }),
    ]);

    expect(built).toEqual([null, target, null]);
  });
});

describe('fromShareable with a diagram sidecar', () => {
  const tuples: ShareableAnnotation[] = [
    ['C', 'hello', 'ordinary note', null],
    ['C', 'Node “Validate input”', 'reject empty payloads', null],
  ];

  test('a legacy payload without the sidecar deserializes exactly as before', () => {
    const withoutSidecar = fromShareable(tuples);
    const withUndefined = fromShareable(tuples, undefined, undefined, undefined);

    expect(withoutSidecar.every((a) => a.diagramTarget === undefined)).toBe(true);
    expect(withUndefined.map((a) => a.originalText)).toEqual(withoutSidecar.map((a) => a.originalText));
    expect(withUndefined.map((a) => a.text)).toEqual(withoutSidecar.map((a) => a.text));
  });

  test('attaches targets positionally and leaves null positions untouched', () => {
    const restored = fromShareable(tuples, null, null, [null, target]);

    expect(restored[0].diagramTarget).toBeUndefined();
    expect(restored[1].diagramTarget).toEqual(target);
  });

  test('round-trips every field including selected text, owner, and unresolved state', () => {
    const textTarget: DiagramAnnotationTarget = {
      renderer: 'graphviz',
      kind: 'text',
      label: 'retry',
      ownerLabel: 'Validate input',
      selectedText: 'empty payload',
      anchor: { x: 0, y: 1 },
      blockFingerprint: 'diagram:graphviz:12345678',
      diagramIndex: 2,
      unresolved: true,
    };
    const annotations = [comment({ diagramTarget: textTarget })];

    const restored = fromShareable(
      toShareable(annotations),
      null,
      null,
      // A real share round-trips through JSON compression.
      JSON.parse(JSON.stringify(buildDiagramTargetArray(annotations))),
    );

    expect(restored[0].diagramTarget).toEqual(textTarget);
  });

  test('ignores malformed sidecar entries rather than crashing or placing a junk pin', () => {
    const malformed = [
      { ...target, renderer: 'excalidraw' },
      { ...target, kind: 'sticker' },
      { ...target, anchor: { x: 'left', y: 0.5 } },
      { ...target, anchor: undefined },
      { ...target, blockFingerprint: '' },
      { ...target, diagramIndex: Number.NaN },
      'not-an-object',
      null,
    ];
    const many = malformed.map((_, index) => ['C', `t${index}`, 'note', null] as ShareableAnnotation);

    const restored = fromShareable(many, null, null, malformed as never);

    expect(restored).toHaveLength(malformed.length);
    expect(restored.every((a) => a.diagramTarget === undefined)).toBe(true);
  });

  test('drops an unresolved flag that is not literally true', () => {
    const restored = fromShareable(
      [['C', 'x', 'note', null]],
      null,
      null,
      [{ ...target, unresolved: 'yes' } as never],
    );

    expect(restored[0].diagramTarget?.unresolved).toBeUndefined();
  });

  test('a sidecar shorter than the annotation list leaves the rest backward-compatible', () => {
    const restored = fromShareable(tuples, null, null, [target]);

    expect(restored[0].diagramTarget).toEqual(target);
    expect(restored[1].diagramTarget).toBeUndefined();
  });

  test('a sidecar longer than the annotation list does not invent annotations', () => {
    const restored = fromShareable([['C', 'x', 'note', null]], null, null, [target, target, target]);

    expect(restored).toHaveLength(1);
    expect(restored[0].diagramTarget).toEqual(target);
  });
});

describe('applyDiagramTargetArray', () => {
  test('is a no-op for a missing sidecar', () => {
    const annotations = [comment()];
    expect(applyDiagramTargetArray(annotations, null)).toBe(annotations);
    expect(applyDiagramTargetArray(annotations, undefined)).toBe(annotations);
  });

  test('never mutates the annotations it is given', () => {
    const annotations = [comment()];
    const applied = applyDiagramTargetArray(annotations, [target]);

    expect(annotations[0].diagramTarget).toBeUndefined();
    expect(applied[0].diagramTarget).toEqual(target);
  });
});
