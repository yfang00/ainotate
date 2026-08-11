import { describe, expect, test } from 'bun:test';
import { AnnotationType, type Annotation, type Block, type DiagramAnnotationTarget } from '@ainotate/ui/types';
import { fingerprintDiagramBlock } from '@ainotate/ui/components/diagram-annotations/model';
import { buildDiagramBlockIndex, remapDiagramAnnotation } from './diagramAnnotationRemap';

const MERMAID_SOURCE = 'flowchart LR\nA[Validate input] -->|retry| B[Render output]';
const EDITED_SOURCE = `${MERMAID_SOURCE}\nB --> C[Persist]`;
const DOT_SOURCE = 'digraph { A -> B }';

function codeBlock(id: string, language: string, content: string, order: number): Block {
  return { id, type: 'code', language, content, order, startLine: order * 10 + 1 };
}

function paragraph(id: string, order: number): Block {
  return { id, type: 'paragraph', content: 'prose', order, startLine: order * 10 + 1 };
}

function diagramAnnotation(target: Partial<DiagramAnnotationTarget> & { blockFingerprint: string }): Annotation {
  return {
    id: 'ann-1',
    blockId: 'diagram-original',
    startOffset: 0,
    endOffset: 0,
    type: AnnotationType.COMMENT,
    text: 'reconsider this',
    originalText: 'Node “Validate input”',
    createdA: 1,
    startMeta: { parentTagName: 'DIV', parentIndex: 3, textOffset: 7 },
    diagramTarget: {
      renderer: 'mermaid',
      kind: 'node',
      semanticKey: 'node:validate',
      label: 'Validate input',
      anchor: { x: 0.25, y: 0.5 },
      diagramIndex: 0,
      ...target,
    },
  };
}

describe('buildDiagramBlockIndex', () => {
  test('numbers diagrams per renderer in document order and ignores other blocks', () => {
    const entries = buildDiagramBlockIndex([
      paragraph('p1', 0),
      codeBlock('m1', 'mermaid', MERMAID_SOURCE, 1),
      codeBlock('ts', 'typescript', 'const a = 1;', 2),
      codeBlock('d1', 'dot', DOT_SOURCE, 3),
      codeBlock('m2', 'mermaid', EDITED_SOURCE, 4),
    ]);

    expect(entries).toEqual([
      { blockId: 'm1', renderer: 'mermaid', diagramIndex: 0, fingerprint: fingerprintDiagramBlock('mermaid', MERMAID_SOURCE) },
      { blockId: 'd1', renderer: 'graphviz', diagramIndex: 0, fingerprint: fingerprintDiagramBlock('graphviz', DOT_SOURCE) },
      { blockId: 'm2', renderer: 'mermaid', diagramIndex: 1, fingerprint: fingerprintDiagramBlock('mermaid', EDITED_SOURCE) },
    ]);
  });

  test('classifies every graphviz fence alias and ignores plain code', () => {
    const entries = buildDiagramBlockIndex([
      codeBlock('a', 'gv', DOT_SOURCE, 0),
      codeBlock('b', 'graphviz', DOT_SOURCE, 1),
      codeBlock('c', 'bash', 'ls', 2),
    ]);

    expect(entries.map((entry) => entry.blockId)).toEqual(['a', 'b']);
    expect(entries.every((entry) => entry.renderer === 'graphviz')).toBe(true);
  });
});

describe('remapDiagramAnnotation', () => {
  test('leaves an annotation without a diagram target untouched', () => {
    const plain: Annotation = {
      id: 'plain',
      blockId: 'b1',
      startOffset: 0,
      endOffset: 0,
      type: AnnotationType.COMMENT,
      originalText: 'hello world',
      createdA: 1,
    };
    const entries = buildDiagramBlockIndex([codeBlock('m1', 'mermaid', MERMAID_SOURCE, 0)]);

    expect(remapDiagramAnnotation(plain, entries)).toBe(plain);
  });

  test('keeps an unchanged diagram on its block and reports it resolved', () => {
    const blocks = [codeBlock('diagram-original', 'mermaid', MERMAID_SOURCE, 0)];
    const annotation = diagramAnnotation({ blockFingerprint: fingerprintDiagramBlock('mermaid', MERMAID_SOURCE) });

    const remapped = remapDiagramAnnotation(annotation, buildDiagramBlockIndex(blocks));

    expect(remapped).toBe(annotation);
    expect(remapped.diagramTarget?.unresolved).toBeUndefined();
  });

  test('follows a moved diagram by fingerprint even when its block id changed', () => {
    const fingerprint = fingerprintDiagramBlock('mermaid', MERMAID_SOURCE);
    const annotation = diagramAnnotation({ blockFingerprint: fingerprint });
    const entries = buildDiagramBlockIndex([
      paragraph('intro', 0),
      codeBlock('diagram-moved', 'mermaid', MERMAID_SOURCE, 1),
    ]);

    const remapped = remapDiagramAnnotation(annotation, entries);

    expect(remapped.blockId).toBe('diagram-moved');
    expect(remapped.diagramTarget?.unresolved).toBeUndefined();
    expect(remapped.diagramTarget?.blockFingerprint).toBe(fingerprint);
    // Positional web-highlighter metadata must not survive a block move.
    expect(remapped.startMeta).toBeUndefined();
  });

  test('prefers the saved occurrence when a document repeats one diagram verbatim', () => {
    const fingerprint = fingerprintDiagramBlock('mermaid', MERMAID_SOURCE);
    const annotation = diagramAnnotation({ blockFingerprint: fingerprint, diagramIndex: 1 });
    const entries = buildDiagramBlockIndex([
      codeBlock('first', 'mermaid', MERMAID_SOURCE, 0),
      codeBlock('second', 'mermaid', MERMAID_SOURCE, 1),
    ]);

    expect(remapDiagramAnnotation(annotation, entries).blockId).toBe('second');
  });

  test('moves an edited diagram with a semantic key to the new block and leaves it resolvable', () => {
    const savedFingerprint = fingerprintDiagramBlock('mermaid', MERMAID_SOURCE);
    const annotation = diagramAnnotation({ blockFingerprint: savedFingerprint });
    const entries = buildDiagramBlockIndex([codeBlock('diagram-edited', 'mermaid', EDITED_SOURCE, 0)]);

    const remapped = remapDiagramAnnotation(annotation, entries);

    expect(remapped.blockId).toBe('diagram-edited');
    expect(remapped.diagramTarget?.unresolved).toBeUndefined();
    // The saved fingerprint stays put: it is what keeps resolveDiagramTarget()
    // from falling back to the saved position inside changed content.
    expect(remapped.diagramTarget?.blockFingerprint).toBe(savedFingerprint);
  });

  test('marks an edited diagram unresolved when nothing is left to rematch by', () => {
    const annotation = diagramAnnotation({
      blockFingerprint: fingerprintDiagramBlock('mermaid', MERMAID_SOURCE),
      semanticKey: undefined,
      label: undefined,
    });
    const entries = buildDiagramBlockIndex([codeBlock('diagram-edited', 'mermaid', EDITED_SOURCE, 0)]);

    const remapped = remapDiagramAnnotation(annotation, entries);

    expect(remapped.blockId).toBe('diagram-edited');
    expect(remapped.diagramTarget?.unresolved).toBe(true);
  });

  test('updates the deterministic index fallback when the saved occurrence is gone', () => {
    const annotation = diagramAnnotation({
      blockFingerprint: fingerprintDiagramBlock('mermaid', MERMAID_SOURCE),
      diagramIndex: 3,
      semanticKey: undefined,
      label: undefined,
    });
    const entries = buildDiagramBlockIndex([
      codeBlock('only-one', 'mermaid', EDITED_SOURCE, 0),
    ]);

    const remapped = remapDiagramAnnotation(annotation, entries);

    expect(remapped.blockId).toBe('only-one');
    expect(remapped.diagramTarget?.diagramIndex).toBe(0);
    expect(remapped.diagramTarget?.unresolved).toBe(true);
  });

  test('keeps the annotation but drops its block when the renderer has no diagrams left', () => {
    const annotation = diagramAnnotation({ blockFingerprint: fingerprintDiagramBlock('mermaid', MERMAID_SOURCE) });
    const entries = buildDiagramBlockIndex([codeBlock('d1', 'dot', DOT_SOURCE, 0)]);

    const remapped = remapDiagramAnnotation(annotation, entries);

    expect(remapped.blockId).toBe('');
    expect(remapped.diagramTarget?.unresolved).toBe(true);
    expect(remapped.text).toBe('reconsider this');
  });

  test('never borrows a diagram from the other renderer', () => {
    const annotation = diagramAnnotation({
      renderer: 'graphviz',
      blockFingerprint: fingerprintDiagramBlock('graphviz', DOT_SOURCE),
    });
    const entries = buildDiagramBlockIndex([codeBlock('m1', 'mermaid', MERMAID_SOURCE, 0)]);

    expect(remapDiagramAnnotation(annotation, entries).blockId).toBe('');
  });

  test('clears a stale unresolved flag once the saved diagram is back', () => {
    const fingerprint = fingerprintDiagramBlock('mermaid', MERMAID_SOURCE);
    const annotation = diagramAnnotation({ blockFingerprint: fingerprint, unresolved: true });
    const entries = buildDiagramBlockIndex([codeBlock('diagram-original', 'mermaid', MERMAID_SOURCE, 0)]);

    const remapped = remapDiagramAnnotation(annotation, entries);

    expect(remapped.diagramTarget?.unresolved).toBeUndefined();
    expect('unresolved' in (remapped.diagramTarget ?? {})).toBe(false);
  });
});
