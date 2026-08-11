/**
 * Editor-facing entry point for diagram comment re-anchoring.
 *
 * The implementation lives in @ainotate/ui because the same block-index and
 * remap are needed by share/draft restore inside the published package. This
 * module keeps the editor's import stable and is the place to add any
 * editor-only remapping behavior.
 */
export {
  buildDiagramBlockIndex,
  remapDiagramAnnotation,
  type DiagramBlockEntry,
} from '@ainotate/ui/components/diagram-annotations/blockIndex';
