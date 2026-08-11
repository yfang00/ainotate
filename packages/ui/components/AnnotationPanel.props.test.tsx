/**
 * Consumer-surface contract for AnnotationPanel's host props:
 *   - readOnly hides every mutation affordance (delete/edit on all card kinds)
 *   - renderCardFooter renders a per-card slot whose interactions do NOT
 *     select the card
 * Both default to today's behavior (mutable, no footer).
 */
import { afterEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

import { AnnotationPanel } from './AnnotationPanel';
import { AnnotationType, type Annotation } from '../types';

const hasDom = typeof document !== 'undefined';

const annotation: Annotation = {
  id: 'a1',
  blockId: 'b1',
  startOffset: 0,
  endOffset: 5,
  type: AnnotationType.COMMENT,
  text: 'a note',
  originalText: 'hello',
  createdA: 1,
};

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
});

const baseProps = {
  isOpen: true,
  annotations: [annotation],
  blocks: [],
  onSelect: () => {},
  onDelete: () => {},
  selectedId: null,
};

describe('AnnotationPanel consumer props', () => {
  test.skipIf(!hasDom)('default renders the delete affordance (today’s behavior)', async () => {
    await mount(<AnnotationPanel {...baseProps} />);
    expect(document.querySelector('button[title="Delete annotation"]')).not.toBeNull();
  });

  test.skipIf(!hasDom)('readOnly hides delete and edit affordances', async () => {
    await mount(
      <AnnotationPanel
        {...baseProps}
        readOnly
        onEdit={() => {}}
      />,
    );
    expect(document.querySelector('button[title="Delete annotation"]')).toBeNull();
    expect(document.querySelector('button[title="Edit annotation"]')).toBeNull();
  });

  test.skipIf(!hasDom)('renderCardFooter renders per-card and does not select the card', async () => {
    const selected: string[] = [];
    let footerClicks = 0;
    await mount(
      <AnnotationPanel
        {...baseProps}
        onSelect={(id) => selected.push(id)}
        renderCardFooter={(a) => (
          <button type="button" data-testid="reply" onClick={() => { footerClicks++; }}>
            reply to {a.id}
          </button>
        )}
      />,
    );

    const slot = document.querySelector('[data-annotation-card-footer="true"]');
    expect(slot).not.toBeNull();
    expect(slot!.textContent).toContain('reply to a1');

    const replyBtn = document.querySelector('[data-testid="reply"]') as HTMLButtonElement;
    await act(async () => {
      replyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(footerClicks).toBe(1);
    // The click bubbled only to the slot wrapper, which stops propagation —
    // the card's onSelect must not fire.
    expect(selected).toHaveLength(0);
  });

  test.skipIf(!hasDom)('no footer prop → no slot rendered', async () => {
    await mount(<AnnotationPanel {...baseProps} />);
    expect(document.querySelector('[data-annotation-card-footer="true"]')).toBeNull();
  });
});

describe('AnnotationPanel diagram target context', () => {
  const diagramAnnotation = (target: Partial<Annotation['diagramTarget']> = {}): Annotation => ({
    id: 'd1',
    blockId: 'diagram-1',
    startOffset: 0,
    endOffset: 0,
    type: AnnotationType.COMMENT,
    text: 'should reject empty payloads',
    originalText: 'Node “Validate input”',
    createdA: 1,
    diagramTarget: {
      renderer: 'mermaid',
      kind: 'node',
      label: 'Validate input',
      anchor: { x: 0.25, y: 0.5 },
      blockFingerprint: 'diagram:mermaid:0000abcd',
      diagramIndex: 0,
      ...target,
    } as NonNullable<Annotation['diagramTarget']>,
  });

  test.skipIf(!hasDom)('names the diagram element instead of quoting originalText', async () => {
    await mount(<AnnotationPanel {...baseProps} annotations={[diagramAnnotation()]} />);

    const card = document.querySelector('[data-annotation-id="d1"]')!;
    expect(card.textContent).toContain('Diagram node');
    expect(card.textContent).toContain('"Validate input"');
    expect(card.textContent).toContain('should reject empty payloads');
    // The raw description is replaced by the structured context, not appended.
    expect(card.textContent).not.toContain('Node “Validate input”');
    expect(card.textContent).not.toContain('Diagram target changed');
  });

  test.skipIf(!hasDom)('labels edges and text selections by their own kind', async () => {
    await mount(
      <AnnotationPanel
        {...baseProps}
        annotations={[
          diagramAnnotation({ kind: 'edge', label: 'retry' }),
          { ...diagramAnnotation({ kind: 'text', selectedText: 'empty payload', ownerLabel: 'Validate input' }), id: 'd2' },
        ]}
      />,
    );

    expect(document.querySelector('[data-annotation-id="d1"]')!.textContent).toContain('Diagram edge');
    const textCard = document.querySelector('[data-annotation-id="d2"]')!;
    expect(textCard.textContent).toContain('Diagram text');
    expect(textCard.textContent).toContain('"empty payload"');
  });

  test.skipIf(!hasDom)('surfaces an unresolved target so a lost pin is never silent', async () => {
    await mount(<AnnotationPanel {...baseProps} annotations={[diagramAnnotation({ unresolved: true })]} />);

    const card = document.querySelector('[data-annotation-id="d1"]')!;
    expect(card.textContent).toContain('Diagram target changed');
    // Still editable and readable — an unresolved comment is not a dead one.
    expect(card.textContent).toContain('should reject empty payloads');
  });

  test.skipIf(!hasDom)('leaves non-diagram cards quoting their original text', async () => {
    await mount(<AnnotationPanel {...baseProps} />);

    const card = document.querySelector('[data-annotation-id="a1"]')!;
    expect(card.textContent).toContain('"hello"');
    expect(card.textContent).not.toContain('Diagram');
  });
});
