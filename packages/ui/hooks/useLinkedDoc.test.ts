import { describe, expect, test } from 'bun:test';
import type { Annotation } from '../types';
import { clearLinkedDocSessionFeedback, type LinkedDocSessionState } from './useLinkedDoc';

const annotation = { id: 'annotation-1' } as Annotation;

describe('clearLinkedDocSessionFeedback', () => {
  test('clears root and linked-document feedback while preserving document content', () => {
    const state: LinkedDocSessionState = {
      root: {
        markdown: '# Root',
        renderAs: 'markdown',
        rawHtml: '',
        shareHtml: '',
        annotations: [annotation],
        selectedAnnotationId: annotation.id,
        globalAttachments: [{ path: '/tmp/root.png', name: 'root.png' }],
      },
      docs: new Map([
        ['guide.md', {
          markdown: '# Guide',
          isConverted: true,
          annotations: [annotation],
          globalAttachments: [{ path: '/tmp/guide.png', name: 'guide.png' }],
        }],
      ]),
    };

    const cleared = clearLinkedDocSessionFeedback(state);

    expect(cleared.root).toEqual({
      ...state.root,
      annotations: [],
      selectedAnnotationId: null,
      globalAttachments: [],
    });
    expect(cleared.docs.get('guide.md')).toEqual({
      markdown: '# Guide',
      isConverted: true,
      annotations: [],
      globalAttachments: [],
    });
    expect(state.root.annotations).toHaveLength(1);
    expect(state.docs.get('guide.md')?.annotations).toHaveLength(1);
  });
});
