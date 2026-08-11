/**
 * Re-anchors diagram comments after the document is edited.
 *
 * The generic remap in App.tsx finds an annotation's new block by searching
 * block contents for its `originalText`. A diagram comment's originalText is a
 * description of the rendered element (`Node “Validate input”`), which never
 * appears in the Mermaid/Graphviz source — so that search always misses and the
 * comment silently loses its block. This module gives diagram comments their
 * own block-level path, built only from parsed blocks, language classification,
 * fingerprints, and the metadata already persisted on the target. No renderer
 * DOM is involved: matching a saved element to a re-rendered one needs the SVG
 * and stays in DiagramAnnotationLayer.
 *
 * `blockFingerprint` is deliberately NOT rewritten when the source changed. It
 * is the guard that stops resolveDiagramTarget() from falling back to the saved
 * position inside materially different content, so preserving it is what keeps
 * an unmatched comment honest rather than silently misattached.
 */
import type { Annotation, Block, DiagramAnnotationTarget } from '../../types';
import { isGraphvizLanguage, isMermaidLanguage } from '../diagramLanguages';
import { fingerprintDiagramBlock } from './model';

export interface DiagramBlockEntry {
  blockId: string;
  renderer: DiagramAnnotationTarget['renderer'];
  diagramIndex: number;
  fingerprint: string;
}

/**
 * Diagram blocks in document order, numbered per renderer. Mirrors the
 * occurrence counting Viewer uses so an index means the same thing on both
 * sides of an edit.
 */
export function buildDiagramBlockIndex(blocks: Block[]): DiagramBlockEntry[] {
  const occurrence = { mermaid: 0, graphviz: 0 };
  const entries: DiagramBlockEntry[] = [];

  for (const block of blocks) {
    if (block.type !== 'code') continue;
    const renderer = isMermaidLanguage(block.language)
      ? 'mermaid'
      : isGraphvizLanguage(block.language)
        ? 'graphviz'
        : null;
    if (!renderer) continue;
    entries.push({
      blockId: block.id,
      renderer,
      diagramIndex: occurrence[renderer]++,
      fingerprint: fingerprintDiagramBlock(renderer, block.content),
    });
  }

  return entries;
}

/**
 * Points one diagram annotation at its block in the newly parsed document.
 * Returns the original object when nothing needs to change so callers can keep
 * relying on reference equality.
 */
export function remapDiagramAnnotation(
  annotation: Annotation,
  entries: DiagramBlockEntry[],
): Annotation {
  const target = annotation.diagramTarget;
  if (!target) return annotation;

  const sameRenderer = entries.filter((entry) => entry.renderer === target.renderer);

  // Unchanged content is the common case, including a diagram that merely moved
  // to a different position in the document. Prefer the occurrence the comment
  // was made against when a document repeats the same diagram verbatim.
  const identical = sameRenderer.filter((entry) => entry.fingerprint === target.blockFingerprint);
  const unchanged = identical.find((entry) => entry.diagramIndex === target.diagramIndex) ?? identical[0];
  if (unchanged) {
    return withTarget(annotation, unchanged.blockId, {
      ...target,
      diagramIndex: unchanged.diagramIndex,
      unresolved: undefined,
    });
  }

  // The source changed (or this diagram is gone). Fall back deterministically
  // to the same slot among the renderer's diagrams.
  const fallback = sameRenderer.find((entry) => entry.diagramIndex === target.diagramIndex)
    ?? sameRenderer[sameRenderer.length - 1];
  if (!fallback) {
    // No diagram of this renderer survives — nothing can host the pin.
    return withTarget(annotation, '', { ...target, unresolved: true });
  }

  return withTarget(annotation, fallback.blockId, {
    ...target,
    diagramIndex: fallback.diagramIndex,
    // A saved semantic key can still match the re-rendered SVG, so leave that
    // verdict to the layer. Without one there is nothing left to match by, and
    // the preserved fingerprint already rules out a positional fallback.
    unresolved: target.semanticKey ? target.unresolved : true,
  });
}

function withTarget(
  annotation: Annotation,
  blockId: string,
  target: DiagramAnnotationTarget,
): Annotation {
  const normalized = target.unresolved === undefined
    ? stripUnresolved(target)
    : target;
  if (annotation.blockId === blockId && sameTarget(annotation.diagramTarget, normalized)) {
    return annotation;
  }
  // startMeta/endMeta anchor web-highlighter by positional parent index without
  // validating text; they never apply to a diagram pin and would let a later
  // restore highlight unrelated content.
  return { ...annotation, blockId, diagramTarget: normalized, startMeta: undefined, endMeta: undefined };
}

function stripUnresolved(target: DiagramAnnotationTarget): DiagramAnnotationTarget {
  const { unresolved: _unresolved, ...rest } = target;
  return rest;
}

function sameTarget(
  a: DiagramAnnotationTarget | undefined,
  b: DiagramAnnotationTarget,
): boolean {
  return !!a
    && a.diagramIndex === b.diagramIndex
    && a.blockFingerprint === b.blockFingerprint
    && a.unresolved === b.unresolved;
}
