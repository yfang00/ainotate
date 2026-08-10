# Direct Diagram Annotations Design

## Status

Approved direction: seamless, comment-only annotation of rendered Mermaid and Graphviz elements using hybrid semantic and positional anchors.

## Context

Ainotate renders Mermaid and Graphviz code blocks as interactive SVG diagrams. The diagram viewport already supports pointer-centered wheel zoom, click-and-drag panning, resize-safe navigation, and expanded viewing. Diagram components currently receive only their source block, so they do not participate in the document annotation flow. Users must annotate the diagram source rather than the rendered node, edge, or label they are reviewing.

The document annotation system already supplies comment composition, selection state, sidebar cards, draft persistence, sharing, and feedback export. Direct diagram annotations should join that system instead of introducing a second comment model.

## Goals

- Let an editable reviewer click a rendered node or edge to open the normal comment composer.
- Let a reviewer drag-select rendered SVG text and comment on the selected words when the browser exposes a usable SVG selection.
- Preserve the existing gestures: click-and-drag pans and the mouse wheel zooms.
- Display stable, constant-screen-size annotation pins that track their targets through zoom, pan, resize, and expanded mode.
- Restore annotations after reload and rematch them after a diagram re-render using semantic identity first and position second.
- Include useful diagram context in sidebar cards, shared sessions, drafts, and exported agent feedback.
- Support both Mermaid and Graphviz through one normalized annotation model.

## Non-goals

- Diagram deletion/redline annotations.
- Quick-label behavior for diagram elements.
- Editing Mermaid or Graphviz source by manipulating rendered elements.
- Freehand drawing, arrows, circles, or flattened screenshot annotation.
- Guaranteeing semantic rematches after arbitrary source rewrites.
- Annotating empty diagram background in the first version.

## User Interaction

The feature has no separate annotation mode or “Pin comment” control.

- Hovering a node, edge, or label subtly highlights the element to show that a simple click is commentable.
- Pressing and releasing on the same target without meaningful movement opens Ainotate's existing comment popover at the clicked element.
- Pressing, holding, and moving pans the diagram. A small internal movement tolerance filters normal pointer wobble but is not exposed as a mode.
- Dragging across SVG text takes priority over panning when a non-collapsed text selection is produced. Releasing opens the comment popover for the selected text.
- Wheel input continues to zoom toward the pointer. Existing Shift/horizontal-wheel panning remains unchanged.
- Read-only and source views disable diagram annotation hit testing while retaining navigation.
- Touch uses the same tap-versus-drag distinction where supported, without preventing vertical page scrolling.

Saving a comment creates a numbered pin and the usual sidebar annotation card. Clicking a pin selects its sidebar card. Selecting a diagram annotation from the sidebar scrolls the diagram into view and, when necessary, pans the current viewport just enough to reveal the target without changing zoom.

## Architecture

### Viewer wiring

`Viewer` passes each diagram renderer the annotation capabilities it already passes to the text-highlighter path:

- annotations belonging to the diagram block;
- selected annotation id;
- `onAddAnnotation`;
- `onSelectAnnotation`;
- `readOnly`.

The application continues to own the annotation array, draft scheduling, editing, deletion, sidebar selection, and submission.

### Shared diagram annotation layer

A shared diagram-annotation hook/component owns renderer-independent behavior:

- pointer gesture classification;
- text-selection detection;
- comment-popover state;
- pin rendering and selection;
- diagram-space/screen-space projection;
- target restoration and unresolved-target state.

Mermaid and Graphviz keep their existing rendering and viewport code. They provide a small renderer adapter that recognizes their SVG DOM and returns normalized targets. This avoids another large copy of interaction logic while keeping renderer-specific DOM assumptions isolated and testable.

### Renderer adapters

Each adapter exposes operations equivalent to:

1. Resolve the commentable target under a pointer or selection.
2. Derive a semantic key and human-readable label.
3. Locate a previously saved target after re-render.
4. Return a diagram-space anchor point for a target.
5. Install/remove non-destructive hover and edge hit-area affordances.

Mermaid resolution uses generated node/edge groups, available ids/data attributes, visible labels, and ownership relationships. Graphviz resolution uses `g.node`, `g.edge`, their `title` elements, and visible text. Text targets retain their owning node or edge identity as well as the selected words.

Thin edges receive transparent, wider pointer hit areas derived from their visible paths. These helpers never alter the displayed stroke and are recreated with each SVG render.

### Viewport integration

The viewport layer emits a lightweight notification whenever its applied viewBox changes. The annotation overlay projects each diagram-space anchor into the current container rectangle:

```text
screenX = (anchorX - viewBox.x) / viewBox.width  * viewport.width
screenY = (anchorY - viewBox.y) / viewBox.height * viewport.height
```

Pins are HTML overlay elements rather than SVG children, so their size, label, focus ring, and hit target remain consistent at every zoom level. The overlay is clipped with the diagram viewport and does not intercept drag gestures outside the pins themselves.

## Annotation Data

`Annotation` gains an optional diagram target. Existing annotation fields and annotation types remain backward compatible.

```ts
interface DiagramAnnotationTarget {
  renderer: 'mermaid' | 'graphviz';
  kind: 'node' | 'edge' | 'text';
  semanticKey?: string;
  label?: string;
  selectedText?: string;
  anchor: { x: number; y: number }; // normalized to the natural diagram bounds
  blockFingerprint: string;         // fingerprint of renderer + source content
  diagramIndex: number;             // same-renderer block occurrence fallback
}
```

The containing annotation keeps its normal `blockId`, comment text, author, images, timestamps, and `COMMENT` type. `originalText` is the selected text when available, otherwise a concise target description such as `Node “Validate input”` or `Edge “retry”`. The sidebar uses the structured diagram target to render an explicit `Diagram node`, `Diagram edge`, or `Diagram text` context label.

Normalized anchors provide a layout-independent positional fallback and compact sharing representation. The semantic key provides the preferred identity. The block fingerprint prevents a positional fallback from silently attaching to a materially different diagram.

## Creation and Restoration Flow

### Creation

1. The adapter resolves the clicked/selected SVG element.
2. The gesture layer confirms the interaction was a click or text selection rather than a pan.
3. The adapter creates semantic context and an anchor normalized against the natural diagram bounds.
4. The existing comment popover opens at the element or selection rectangle.
5. On submit, the diagram layer constructs a normal `COMMENT` annotation with `diagramTarget` and calls `onAddAnnotation`.
6. Existing application state, draft saving, sidebar selection, editing, deletion, and feedback submission continue unchanged.

### Restoration

For an unchanged block, the saved `blockId` and semantic key resolve the target directly. After a re-render or document edit:

1. Find the diagram block by current block id when it is still compatible.
2. Otherwise match the block fingerprint; use same-renderer `diagramIndex` only as a deterministic last block lookup.
3. Ask the renderer adapter for an exact semantic-key match.
4. If the key is missing, try a unique same-kind label/owner match.
5. If the block fingerprint is unchanged, fall back to the normalized anchor.
6. If the source changed and no semantic match is safe, keep the annotation but mark its target unresolved instead of silently moving it.

An unresolved annotation remains editable, deletable, shareable, and exportable. Its sidebar card displays `Diagram target changed`, and the diagram shows a warning pin at its boundary rather than claiming a specific element.

## Persistence, Sharing, and Export

Draft persistence already stores full annotation objects, so the optional target round-trips without a new server schema.

Compact URL sharing adds an optional parallel `diagramTargets` sidecar to the existing annotation tuple payload. Older links omit it; older annotations continue to deserialize unchanged. Share restoration uses the block fingerprint and diagram index to repopulate the current block id before rendering pins.

Feedback export identifies the rendered target in language useful to the coding agent:

```markdown
## 2. (lines 18–31) Feedback on diagram node “Validate input”
> This should also reject empty payloads.
```

For selected text, export quotes those words and names the owning node/edge when available. For an unresolved target, export says that the diagram changed after the comment and includes the last known kind/label; raw coordinates are never presented as meaningful instructions.

## Failure Handling and Accessibility

- If an SVG structure is unrecognized, the element is not advertised as commentable. Navigation continues normally.
- A malformed or old `diagramTarget` is ignored as an anchor but the annotation remains visible in the sidebar.
- Hover decoration and invisible edge hit areas are removed on re-render/unmount.
- Pins are keyboard-focusable buttons with annotation number, target kind/label, and selected state exposed through accessible labels.
- Enter/Space on a focused pin selects the annotation. Escape closes the comment popover through its existing behavior.
- Pin colors and hover outlines use theme tokens and must meet the same contrast expectations as existing comment highlights.
- Annotation interaction does not intercept diagram toolbar controls, existing pins, source view, or read-only sessions.

## Testing

### Pure/unit tests

- Coordinate normalization and viewBox-to-screen projection across zoom, pan, and resize.
- Gesture classification: click, pointer wobble, drag-to-pan, and text selection.
- Mermaid and Graphviz target extraction from representative SVG fixtures.
- Semantic rematch, unique-label fallback, same-fingerprint positional fallback, and unresolved behavior.
- Sharing serialization/deserialization compatibility with and without diagram targets.
- Feedback export for node, edge, text, and unresolved annotations.

### Component/integration tests

- Clicking nodes and edges opens the normal comment popover and submits one annotation.
- Dragging from nodes, edges, text-free areas, and the background pans without opening a comment.
- SVG text selection creates a text target when supported and never creates both a pan and comment.
- Pins follow viewport changes, select sidebar cards, and restore from drafts/shared payloads.
- Read-only and source modes do not create diagram annotations.

### Browser verification

Verify Mermaid and Graphviz in inline and expanded views with mouse and trackpad:

- hover affordances and practical edge hit areas;
- click comments versus click-and-drag panning;
- text selection where browser SVG behavior permits it;
- wheel zoom and horizontal navigation regression checks;
- pin position and constant size through zoom, pan, resize, and expand/collapse;
- annotation creation, editing, deletion, sidebar navigation, draft reload, and theme contrast;
- no console warnings or errors.

## Acceptance Criteria

- A reviewer can comment on a Mermaid or Graphviz node/edge with a simple click and no mode toggle.
- Click-and-drag still pans and never opens a comment.
- SVG text can be commented when a valid selection is available.
- Saved pins stay visually attached during every viewport operation.
- Draft and sharing round trips preserve diagram context.
- Exported feedback names the relevant diagram element.
- Unsafe restoration is shown as unresolved rather than silently misattached.
- Existing text annotation, diagram navigation, source view, and read-only behavior do not regress.
