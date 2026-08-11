/**
 * Exported feedback has to name the diagram element the reviewer clicked —
 * that string is what the coding agent acts on. Normalized anchor coordinates
 * are never emitted: they are not an instruction anyone can follow.
 */
import { describe, expect, test } from 'bun:test';
import { AnnotationType, type Annotation, type Block, type DiagramAnnotationTarget } from '../types';
import { exportAnnotations, exportLinkedDocAnnotations } from './parser';

const diagramBlock: Block = {
  id: 'diagram-1',
  type: 'code',
  language: 'mermaid',
  content: 'flowchart LR\nA[Validate input] -->|retry| B[Render output]',
  order: 0,
  startLine: 18,
};

function diagramComment(
  target: Partial<DiagramAnnotationTarget>,
  overrides: Partial<Annotation> = {},
): Annotation {
  return {
    id: 'd1',
    blockId: diagramBlock.id,
    startOffset: 0,
    endOffset: 0,
    type: AnnotationType.COMMENT,
    text: 'This should also reject empty payloads.',
    originalText: 'Node “Validate input”',
    createdA: 1,
    diagramTarget: {
      renderer: 'mermaid',
      kind: 'node',
      label: 'Validate input',
      anchor: { x: 0.25, y: 0.75 },
      blockFingerprint: 'diagram:mermaid:0000abcd',
      diagramIndex: 0,
      ...target,
    },
    ...overrides,
  };
}

describe('exportAnnotations for diagram comments', () => {
  test('names a node target', () => {
    const output = exportAnnotations([diagramBlock], [diagramComment({ kind: 'node', label: 'Validate input' })]);

    expect(output).toContain('Feedback on diagram node “Validate input”');
    expect(output).toContain('> This should also reject empty payloads.');
  });

  test('names an edge target', () => {
    const output = exportAnnotations([diagramBlock], [diagramComment({ kind: 'edge', label: 'retry' })]);

    expect(output).toContain('Feedback on diagram edge “retry”');
  });

  test('quotes selected words and names their owning node', () => {
    const output = exportAnnotations([diagramBlock], [diagramComment({
      kind: 'text',
      label: undefined,
      selectedText: 'empty payload',
      ownerLabel: 'Validate input',
    })]);

    expect(output).toContain('Feedback on diagram text “empty payload” in node “Validate input”');
  });

  test('says the diagram changed instead of pointing at a stale element', () => {
    const output = exportAnnotations([diagramBlock], [diagramComment({
      kind: 'edge',
      label: 'retry',
      unresolved: true,
    })]);

    expect(output).toContain('Diagram target changed: last known edge “retry”');
    expect(output).not.toContain('Feedback on diagram edge');
  });

  test('keeps the containing code block line label and never leaks coordinates', () => {
    const output = exportAnnotations([diagramBlock], [diagramComment({ kind: 'node', label: 'Validate input' })]);

    expect(output).toContain('(lines 18–21)');
    expect(output).not.toContain('0.25');
    expect(output).not.toContain('anchor');
  });

  test('leaves ordinary comments, deletions, and global notes untouched', () => {
    const block: Block = { id: 'p1', type: 'paragraph', content: 'hello world', order: 0, startLine: 1 };
    const output = exportAnnotations([block], [
      {
        id: 'c1', blockId: 'p1', startOffset: 0, endOffset: 5, type: AnnotationType.COMMENT,
        text: 'tighten this', originalText: 'hello', createdA: 1,
      },
      {
        id: 'x1', blockId: 'p1', startOffset: 0, endOffset: 5, type: AnnotationType.DELETION,
        originalText: 'world', createdA: 2,
      },
      {
        id: 'g1', blockId: '', startOffset: 0, endOffset: 0, type: AnnotationType.GLOBAL_COMMENT,
        text: 'overall looks fine', originalText: '', createdA: 3,
      },
    ]);

    expect(output).toContain('Feedback on: "hello"');
    expect(output).toContain('Remove this');
    expect(output).toContain('overall looks fine');
    expect(output).not.toContain('diagram');
  });
});

describe('exportLinkedDocAnnotations for diagram comments', () => {
  test('uses the same phrasing as the main export', () => {
    const output = exportLinkedDocAnnotations(new Map([
      ['docs/architecture.md', {
        annotations: [diagramComment({ kind: 'node', label: 'Validate input' })],
        globalAttachments: [],
        blocks: [diagramBlock],
      }],
    ]));

    expect(output).toContain('Feedback on diagram node “Validate input”');
    expect(output).not.toContain('Node “Validate input”"');
  });
});
