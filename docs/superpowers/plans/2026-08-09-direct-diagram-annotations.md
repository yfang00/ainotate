# Direct Diagram Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let reviewers add ordinary comments directly to rendered Mermaid and Graphviz nodes, edges, and selected SVG text while preserving click-drag panning, wheel zooming, draft/share persistence, sidebar behavior, and useful feedback export.

**Architecture:** Keep Mermaid and Graphviz responsible for rendering and viewport state. Add a shared diagram-annotation layer that consumes small renderer adapters, classifies pointer gestures, opens the existing `CommentPopover`, renders constant-size HTML pins, and resolves saved hybrid semantic/positional anchors. Thread the resulting optional `diagramTarget` through Ainotate's existing `Annotation` model, sharing sidecar, editor remapping, sidebar, and export paths.

**Tech Stack:** TypeScript, React 19, Bun test, happy-dom, Mermaid SVG, Viz.js/Graphviz SVG, Tailwind theme tokens.

## Global Constraints

- Follow the approved design in `docs/superpowers/specs/2026-08-09-direct-diagram-annotations-design.md`.
- Diagram annotations are `AnnotationType.COMMENT` only. Do not add deletion, redline, quick-label, freehand, source-editing, or empty-background annotation behavior.
- A simple click/release may comment; movement beyond the tested threshold pans. Wheel and trackpad behavior must remain unchanged.
- Do not fork annotation storage or composition. Reuse `Annotation`, `CommentPopover`, application-owned state, draft persistence, sidebar cards, and submission.
- Prefer semantic rematching. Never silently use a positional fallback after source/fingerprint changes.
- Keep pins as HTML overlay buttons so they remain constant-size and accessible through zoom and pan.
- Unrecognized SVG structures remain navigable but are not advertised as commentable.
- Preserve backward compatibility for annotations, draft payloads, and share URLs without diagram target metadata.
- Do not modify `packages/ui/components/DiffViewer.tsx` or the Pierre shadow-DOM integration.
- At each task boundary, run the named focused tests before committing. Before completion, run the full verification task.

---

## File Map

### Create

- `packages/ui/components/diagram-annotations/model.ts` — fingerprints, target labels, normalized anchors, restoration decisions, and projection helpers.
- `packages/ui/components/diagram-annotations/model.test.ts` — pure geometry, fingerprint, gesture, restoration, and reveal-pan coverage.
- `packages/ui/components/diagram-annotations/adapters.ts` — Mermaid/Graphviz DOM adapters and temporary hover/edge hit-area lifecycle.
- `packages/ui/components/diagram-annotations/adapters.test.ts` — representative SVG fixture tests for nodes, edges, labels, and cleanup.
- `packages/ui/components/diagram-annotations/DiagramAnnotationLayer.tsx` — shared pointer/text-selection controller, popover, pins, selection/reveal behavior.
- `packages/ui/components/diagram-annotations/DiagramAnnotationLayer.test.tsx` — happy-dom integration coverage for click, drag, text, pins, and read-only behavior.
- `packages/ui/utils/sharing.diagram.test.ts` — compatibility and round-trip tests for the optional target sidecar.
- `packages/ui/utils/parser.diagramAnnotations.test.ts` — node, edge, text, and unresolved export coverage.
- `packages/editor/utils/diagramAnnotationRemap.ts` — pure block-level remapping for edited Mermaid/Graphviz source.
- `packages/editor/utils/diagramAnnotationRemap.test.ts` — unchanged, moved, semantic, and unresolved edit-remapping tests.

### Modify

- `packages/ui/types.ts` — add `DiagramAnnotationTarget` and optional `Annotation.diagramTarget`.
- `packages/ui/components/diagramViewport.ts` — expose the applied viewBox and pure reveal/projection-friendly helpers without changing current viewport semantics.
- `packages/ui/components/diagramViewport.test.ts` — lock the returned viewBox and reveal calculations.
- `packages/ui/components/MermaidBlock.tsx` — accept diagram annotation props, publish viewport changes, and mount the shared layer with the Mermaid adapter.
- `packages/ui/components/GraphvizBlock.tsx` — accept the same props and mount the shared layer with the Graphviz adapter.
- `packages/ui/components/Viewer.tsx` — compute diagram occurrence metadata, filter annotations per block, and wire both renderers.
- `packages/ui/components/AnnotationPanel.tsx` — present structured diagram context and unresolved status.
- `packages/ui/utils/sharing.ts` — serialize and restore a parallel optional diagram-target sidecar.
- `packages/ui/hooks/useSharing.ts` — pass the sidecar into every share import/restore path.
- `packages/ui/hooks/useAnnotationDraft.ts` — pass a legacy tuple draft's sidecar when present; full-object drafts remain automatic.
- `packages/ui/utils/parser.ts` — export human-readable diagram target context.
- `packages/editor/App.tsx` — remap diagram annotations safely when edited markdown changes block ids/content.

---

## Task 1: Add the Backward-Compatible Diagram Target Model

**Files:**

- Modify: `packages/ui/types.ts`
- Create: `packages/ui/components/diagram-annotations/model.ts`
- Create: `packages/ui/components/diagram-annotations/model.test.ts`

- [ ] **Step 1: Write failing model tests**

Add tests that define the public contract:

```ts
const target: DiagramAnnotationTarget = {
  renderer: 'mermaid',
  kind: 'node',
  semanticKey: 'node:validate',
  label: 'Validate input',
  anchor: { x: 0.25, y: 0.75 },
  blockFingerprint: fingerprintDiagramBlock('mermaid', 'flowchart LR\nA-->B'),
  diagramIndex: 0,
};
```

Cover:

- deterministic renderer-plus-source fingerprints and renderer separation;
- clamping/normalizing SVG points against natural bounds;
- projecting normalized anchors into a viewport from an applied viewBox;
- `classifyDiagramGesture(start, end, threshold)` returning `click` below 5 CSS pixels and `drag` at/above it;
- target descriptions for node, edge, and text;
- semantic-key match, unique same-kind label match, unchanged-fingerprint positional fallback, and changed-fingerprint unresolved result;
- malformed normalized coordinates returning an unresolved result rather than throwing;
- calculating the smallest diagram-space pan delta needed to reveal a selected target with pin padding.

- [ ] **Step 2: Run the tests and confirm the intended failure**

Run:

```bash
bun test packages/ui/components/diagram-annotations/model.test.ts
```

Expected: failure because the model/types do not exist.

- [ ] **Step 3: Add the target types**

In `packages/ui/types.ts`, add:

```ts
export interface DiagramAnnotationTarget {
  renderer: 'mermaid' | 'graphviz';
  kind: 'node' | 'edge' | 'text';
  semanticKey?: string;
  label?: string;
  ownerLabel?: string;
  selectedText?: string;
  anchor: { x: number; y: number };
  blockFingerprint: string;
  diagramIndex: number;
  unresolved?: boolean;
}
```

Add `diagramTarget?: DiagramAnnotationTarget` to `Annotation`. `unresolved` is optional so old payloads remain valid; it records the approved design's persistent “Diagram target changed” state for sidebar/export after unsafe remapping.

- [ ] **Step 4: Implement pure model helpers**

Export focused functions from `model.ts`:

```ts
fingerprintDiagramBlock(renderer, source): string
normalizeDiagramPoint(point, naturalBounds): DiagramPoint | null
projectDiagramAnchor(anchor, naturalBounds, appliedViewBox, viewport): DiagramPoint | null
classifyDiagramGesture(start, end, threshold?): 'click' | 'drag'
describeDiagramTarget(target): string
resolveDiagramTarget(saved, candidates, currentFingerprint): DiagramTargetResolution
getPanDeltaToReveal(anchor, appliedViewBox, viewport, paddingPx): DiagramPoint
```

Use a small stable synchronous string hash implemented in this browser-safe file; do not import Node-only draft/storage code.

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun test packages/ui/components/diagram-annotations/model.test.ts packages/ui/components/diagramViewport.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit the model**

```bash
git add packages/ui/types.ts packages/ui/components/diagram-annotations/model.ts packages/ui/components/diagram-annotations/model.test.ts
git commit -m "feat(ui): add diagram annotation target model"
```

---

## Task 2: Build and Test Mermaid/Graphviz SVG Adapters

**Files:**

- Create: `packages/ui/components/diagram-annotations/adapters.ts`
- Create: `packages/ui/components/diagram-annotations/adapters.test.ts`

- [ ] **Step 1: Write representative SVG fixture tests**

Construct SVG elements in happy-dom from stable, minimal fixtures rather than snapshotting entire third-party renderer output. Cover:

- Mermaid node groups with generated ids/classes and visible `text`/`foreignObject` labels;
- Mermaid edge groups/paths and edge labels;
- Graphviz `g.node` and `g.edge` groups with `title` identity and visible `text` labels;
- a text selection owner resolving to `kind: 'text'` while retaining its node/edge semantic owner;
- exact semantic lookup and unique-label lookup after re-render;
- transparent edge hit paths cloned with a practical pointer stroke width, `fill="none"`, theme-independent transparency, and a private data attribute;
- cleanup removing hover classes/listeners and generated hit paths;
- unknown/background elements returning `null`.

- [ ] **Step 2: Run the tests and confirm failure**

```bash
bun test packages/ui/components/diagram-annotations/adapters.test.ts
```

Expected: failure because the adapter module does not exist.

- [ ] **Step 3: Define one normalized adapter contract**

Implement:

```ts
export interface DiagramTargetCandidate {
  element: SVGGraphicsElement;
  kind: DiagramAnnotationTarget['kind'];
  semanticKey?: string;
  label?: string;
  ownerLabel?: string;
  anchorSvg: DiagramPoint;
}

export interface DiagramAdapter {
  renderer: DiagramAnnotationTarget['renderer'];
  prepare(svg: SVGSVGElement): () => void;
  resolvePointerTarget(target: EventTarget | null): DiagramTargetCandidate | null;
  resolveTextSelection(selection: Selection): DiagramTargetCandidate | null;
  listCandidates(svg: SVGSVGElement): DiagramTargetCandidate[];
}
```

Export `mermaidDiagramAdapter` and `graphvizDiagramAdapter`. Derive anchors from `getBBox()` centers, with edge/path fallbacks via `getPointAtLength()` when available. Normalize label whitespace. Never depend on one generated id shape when parent classes/title provide a safer identity.

- [ ] **Step 4: Add non-destructive affordances**

`prepare()` should:

- add private `data-diagram-commentable` metadata only to recognized targets;
- add/remove a theme-token hover class without overwriting renderer inline styles;
- clone thin visible edge paths into transparent pointer-only hit paths;
- return idempotent cleanup for re-render/unmount.

- [ ] **Step 5: Run adapter tests**

```bash
bun test packages/ui/components/diagram-annotations/adapters.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit adapters**

```bash
git add packages/ui/components/diagram-annotations/adapters.ts packages/ui/components/diagram-annotations/adapters.test.ts
git commit -m "feat(ui): recognize diagram annotation targets"
```

---

## Task 3: Make Viewport State Observable Without Regressing Navigation

**Files:**

- Modify: `packages/ui/components/diagramViewport.ts`
- Modify: `packages/ui/components/diagramViewport.test.ts`

- [ ] **Step 1: Add failing applied-view tests**

Add tests for a pure `getAppliedDiagramViewBox(base, zoom, pan)` helper and assert `applyDiagramView()` returns that exact box after writing the SVG attribute. Include centered zoom, non-zero pan, and clamped inputs already supplied by callers.

- [ ] **Step 2: Confirm failure**

```bash
bun test packages/ui/components/diagramViewport.test.ts
```

- [ ] **Step 3: Extract and return the applied box**

Change the API to:

```ts
export function getAppliedDiagramViewBox(
  base: DiagramViewBox,
  zoom: number,
  pan: DiagramPoint,
): DiagramViewBox;

export function applyDiagramView(
  svgEl: SVGSVGElement,
  base: DiagramViewBox,
  zoom: number,
  pan: DiagramPoint,
): DiagramViewBox;
```

Existing callers may ignore the return value. Do not alter zoom limits, initial zoom, pointer-centered wheel math, pan bounds, resize rebasing, or fit behavior.

- [ ] **Step 4: Run viewport regression tests**

```bash
bun test packages/ui/components/diagramViewport.test.ts
```

- [ ] **Step 5: Commit the viewport seam**

```bash
git add packages/ui/components/diagramViewport.ts packages/ui/components/diagramViewport.test.ts
git commit -m "refactor(ui): expose applied diagram viewport"
```

---

## Task 4: Implement the Shared Interaction Layer Test-First

**Files:**

- Create: `packages/ui/components/diagram-annotations/DiagramAnnotationLayer.tsx`
- Create: `packages/ui/components/diagram-annotations/DiagramAnnotationLayer.test.tsx`
- Modify: `packages/ui/theme.css` or `packages/ui/styles.css` only if a reusable class cannot be expressed locally with existing utility classes.

- [ ] **Step 1: Write happy-dom interaction tests**

Mount a small harness containing a viewport, one SVG fixture, and the layer. Stub `getBBox`, `getBoundingClientRect`, pointer capture, and `window.getSelection` explicitly. Test:

- click/release on a node opens the existing `CommentPopover`;
- submitting creates exactly one `COMMENT` annotation with `diagramTarget`, `blockId`, human-readable `originalText`, identity, attachments, and timestamp;
- click/release on an edge behaves the same;
- movement below the threshold remains a click; movement at/above it calls `onPanByPixels` and never opens a popover;
- a non-collapsed SVG text selection wins over pan and stores selected words plus owner context;
- a collapsed/foreign selection falls back to click or pan normally;
- wheel events are untouched by the layer;
- read-only disables preparation and creation but pins remain selectable;
- malformed/unresolved targets render a warning pin without claiming a target;
- pins are buttons, expose target labels, stay constant-size, call `onSelectAnnotation`, and reproject after `appliedViewBox` changes;
- selecting an annotation requests scroll/reveal without changing zoom;
- unmount cleanup removes adapter affordances.

- [ ] **Step 2: Run and confirm failure**

```bash
bun test packages/ui/components/diagram-annotations/DiagramAnnotationLayer.test.tsx
```

- [ ] **Step 3: Implement the layer props and state**

Use this narrow public shape:

```ts
interface DiagramAnnotationLayerProps {
  block: Block;
  renderer: 'mermaid' | 'graphviz';
  diagramIndex: number;
  container: HTMLDivElement | null;
  svg: SVGSVGElement | null;
  naturalBounds: DiagramViewBox | null;
  appliedViewBox: DiagramViewBox | null;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  readOnly: boolean;
  allowImages?: boolean;
  onAskAI?: CommentAskAIHandler;
  onAddAnnotation: (annotation: Annotation) => void;
  onSelectAnnotation: (id: string | null) => void;
  onPanByPixels: (dx: number, dy: number) => boolean;
  onRevealAnchor: (anchor: DiagramPoint) => void;
}
```

The layer owns pending pointer state and `CommentPopover` state. Delay `preventDefault()` and pointer capture until the movement threshold starts a pan so a simple click and browser SVG selection remain possible. Ignore toolbar buttons and existing pin buttons. For touch, preserve `touch-pan-y`; treat a completed tap as a click only when the browser did not scroll/cancel it.

- [ ] **Step 4: Implement pin projection/restoration**

For each annotation:

1. Ask the adapter for semantic/label candidates.
2. Use `resolveDiagramTarget()` to decide exact, label, positional, or unresolved.
3. Project the resolved SVG point through natural bounds and the current applied viewBox.
4. Render a clipped absolute HTML button only when inside the viewport; render the approved warning pin at the nearest boundary for unresolved targets.
5. On selected-id changes, scroll the diagram into view and call `onRevealAnchor()` only if the resolved anchor is outside the padded visible view.

- [ ] **Step 5: Run layer and model tests**

```bash
bun test packages/ui/components/diagram-annotations/DiagramAnnotationLayer.test.tsx packages/ui/components/diagram-annotations/model.test.ts packages/ui/components/diagram-annotations/adapters.test.ts
```

- [ ] **Step 6: Commit the shared layer**

```bash
git add packages/ui/components/diagram-annotations/DiagramAnnotationLayer.tsx packages/ui/components/diagram-annotations/DiagramAnnotationLayer.test.tsx packages/ui/theme.css packages/ui/styles.css
git commit -m "feat(ui): add diagram comment interaction layer"
```

Only stage a stylesheet if it actually changed.

---

## Task 5: Wire Mermaid, Graphviz, and Viewer

**Files:**

- Modify: `packages/ui/components/MermaidBlock.tsx`
- Modify: `packages/ui/components/GraphvizBlock.tsx`
- Modify: `packages/ui/components/Viewer.tsx`
- Modify: `packages/ui/components/Viewer.consumer.test.tsx`

- [ ] **Step 1: Add failing renderer-consumer tests**

Extend consumer coverage to prove `Viewer` supplies each diagram block with:

- only annotations whose `blockId` matches that diagram;
- the correct same-renderer `diagramIndex` in document order;
- selected id and callbacks;
- `readOnly`, `allowImages`, and `onAskAI`.

Add a focused renderer harness assertion that a viewport update after initial view, wheel zoom, pointer pan, fit, resize, and expand/collapse updates the layer's `appliedViewBox` state.

- [ ] **Step 2: Confirm failure**

```bash
bun test packages/ui/components/Viewer.consumer.test.tsx packages/ui/components/diagramViewport.test.ts
```

- [ ] **Step 3: Replace immediate drag with thresholded delegation**

In both renderers:

- accept a shared `DiagramBlockAnnotationProps` type exported beside the layer;
- retain all zoom/pan refs and controls;
- store the most recently returned applied viewBox in React state for overlay projection;
- make every `applyDiagramView()` call publish that state through one local helper;
- delegate pointer down/move/up/cancel to `DiagramAnnotationLayer` rather than beginning a drag immediately;
- expose `panViewportByPixels()` and a reveal callback that adjusts pan only enough to show a selected anchor;
- keep source view and read-only annotation-disabled;
- add `data-pinpoint-ignore` to Graphviz for parity so the document pinpoint system never competes with diagram hit testing;
- remove blanket `select-none` only where required and scope text selection to recognized SVG label text;
- mount the HTML overlay inside the same clipped relative viewport in inline and expanded modes.

Update Mermaid's `React.memo` comparator to include annotation props, selected id, read-only, and relevant callbacks so pins and selection never become stale.

- [ ] **Step 4: Compute renderer occurrence indices in Viewer**

Build a memoized `Map<blockId, { renderer; diagramIndex; fingerprint }>` from `blocks`, incrementing Mermaid and Graphviz indices independently. Pass matching annotations and all annotation capabilities to each renderer.

- [ ] **Step 5: Run focused UI tests and typecheck**

```bash
bun test packages/ui/components/Viewer.consumer.test.tsx packages/ui/components/diagram-annotations/DiagramAnnotationLayer.test.tsx packages/ui/components/diagramViewport.test.ts packages/ui/components/MermaidBlock.test.ts packages/ui/components/diagramLanguages.test.ts
bun run --cwd packages/ui typecheck
```

- [ ] **Step 6: Commit renderer wiring**

```bash
git add packages/ui/components/MermaidBlock.tsx packages/ui/components/GraphvizBlock.tsx packages/ui/components/Viewer.tsx packages/ui/components/Viewer.consumer.test.tsx
git commit -m "feat(ui): enable comments on rendered diagrams"
```

---

## Task 6: Integrate Safe Remapping and Sidebar Context

**Files:**

- Modify: `packages/editor/App.tsx`
- Modify: `packages/ui/components/AnnotationPanel.tsx`
- Modify: `packages/ui/components/AnnotationPanel.props.test.tsx`
- Create: `packages/editor/utils/diagramAnnotationRemap.ts`
- Create: `packages/editor/utils/diagramAnnotationRemap.test.ts`

- [ ] **Step 1: Add failing remap/sidebar tests**

Cover:

- an unchanged diagram retains its block id and resolved status;
- a moved diagram block is found by renderer-plus-content fingerprint;
- an edited diagram with a surviving semantic key moves to the new block and remains resolvable;
- an edited diagram without a safe semantic match keeps the annotation, updates its deterministic diagram block fallback, and sets `diagramTarget.unresolved = true`;
- ordinary text annotation remapping remains unchanged;
- cards show `Diagram node`, `Diagram edge`, or `Diagram text`, the useful label/selection, and `Diagram target changed` when unresolved.

- [ ] **Step 2: Confirm failure**

```bash
bun test packages/ui/components/AnnotationPanel.props.test.tsx packages/editor/utils/diagramAnnotationRemap.test.ts
```

- [ ] **Step 3: Extract a pure editor remapping helper if necessary**

Avoid embedding renderer DOM logic in `App.tsx`. Use parsed code blocks, language classification, fingerprints, diagram indices, and persisted semantic metadata. Keep the existing text-search remap path byte-for-byte equivalent for annotations without `diagramTarget`.

- [ ] **Step 4: Render structured card context**

In `AnnotationCard`, branch on `annotation.diagramTarget` before the generic quoted `originalText` presentation. Use theme tokens, not hard-coded colors. Keep editing, deletion, author, attachments, timestamps, and external-source behavior unchanged.

- [ ] **Step 5: Run tests and editor/UI typechecks**

```bash
bun test packages/ui/components/AnnotationPanel.props.test.tsx packages/editor/utils/diagramAnnotationRemap.test.ts
bun run --cwd packages/ui typecheck
bun run typecheck
```

- [ ] **Step 6: Commit state integration**

```bash
git add packages/editor/App.tsx packages/editor/utils/diagramAnnotationRemap.ts packages/editor/utils/diagramAnnotationRemap.test.ts packages/ui/components/AnnotationPanel.tsx packages/ui/components/AnnotationPanel.props.test.tsx
git commit -m "feat(editor): restore diagram comments safely"
```

---

## Task 7: Preserve Diagram Targets in Sharing, Draft Compatibility, and Export

**Files:**

- Modify: `packages/ui/utils/sharing.ts`
- Modify: `packages/ui/hooks/useSharing.ts`
- Modify: `packages/ui/hooks/useAnnotationDraft.ts`
- Modify: `packages/ui/utils/parser.ts`
- Create: `packages/ui/utils/sharing.diagram.test.ts`
- Create: `packages/ui/utils/parser.diagramAnnotations.test.ts`
- Modify draft seam tests only if the legacy tuple branch needs coverage.

- [ ] **Step 1: Add failing sharing tests**

Define `SharePayload.t?: (DiagramAnnotationTarget | null)[]` as a parallel optional sidecar. Test:

- a legacy payload without `t` deserializes exactly as before;
- only diagram annotations populate sidecar entries and non-diagram positions are `null`;
- all target fields, including selected text and unresolved state, round-trip;
- malformed sidecar entries are ignored rather than crashing;
- sidecar length mismatch leaves unmatched annotations backward-compatible;
- compressed share URL generation includes `t` only when needed.

- [ ] **Step 2: Add failing export tests**

Assert exact useful phrases for:

```text
Feedback on diagram node “Validate input”
Feedback on diagram edge “retry”
Feedback on diagram text “empty payload” in node “Validate input”
Diagram target changed: last known edge “retry”
```

Ensure line labels still use the containing code block and raw coordinates never appear.

- [ ] **Step 3: Confirm failures**

```bash
bun test packages/ui/utils/sharing.diagram.test.ts packages/ui/utils/parser.diagramAnnotations.test.ts
```

- [ ] **Step 4: Implement the optional sharing sidecar**

Add helpers:

```ts
buildDiagramTargetArray(annotations): (DiagramAnnotationTarget | null)[] | null
applyDiagramTargetArray(annotations, targets): Annotation[]
```

Extend `fromShareable()` with an optional target-array argument and update every call in `useSharing.ts` and the legacy tuple path in `useAnnotationDraft.ts`. Do not change the compact annotation tuples, preserving old readers and URLs.

- [ ] **Step 5: Implement diagram-aware export**

Centralize the heading/context formatting in a helper used by both `exportAnnotations` and `exportLinkedDocAnnotations`. Preserve all non-diagram output exactly, including diff labels, images, quick labels, and global comments.

- [ ] **Step 6: Run sharing/export/draft regressions**

```bash
bun test packages/ui/utils/sharing.diagram.test.ts packages/ui/utils/parser.diagramAnnotations.test.ts packages/ui/annotationDraftPersistence.test.tsx packages/ui/hooks/useAnnotationDraft.seam.test.tsx
bun run --cwd packages/ui typecheck
```

- [ ] **Step 7: Commit persistence and export**

```bash
git add packages/ui/utils/sharing.ts packages/ui/hooks/useSharing.ts packages/ui/hooks/useAnnotationDraft.ts packages/ui/utils/parser.ts packages/ui/utils/sharing.diagram.test.ts packages/ui/utils/parser.diagramAnnotations.test.ts packages/ui/annotationDraftPersistence.test.tsx packages/ui/hooks/useAnnotationDraft.seam.test.tsx
git commit -m "feat(ui): persist and export diagram comments"
```

Only stage tests that actually changed.

---

## Task 8: Full Verification and Browser QA

**Files:**

- Modify implementation files only for defects revealed by verification.
- Update `docs/superpowers/specs/2026-08-09-direct-diagram-annotations-design.md` only if implementation required an approved design clarification; do not rewrite the accepted behavior after the fact.

- [ ] **Step 1: Run the full focused suite**

```bash
bun test packages/ui/components/diagram-annotations packages/ui/components/diagramViewport.test.ts packages/ui/components/MermaidBlock.test.ts packages/ui/components/Viewer.consumer.test.tsx packages/ui/components/AnnotationPanel.props.test.tsx packages/ui/utils/sharing.diagram.test.ts packages/ui/utils/parser.diagramAnnotations.test.ts
```

- [ ] **Step 2: Run repository typecheck and build**

```bash
bun run typecheck
bun run build:hook
```

Expected: zero errors. If unrelated pre-existing failures occur, capture exact output and prove focused changed-package checks pass.

- [ ] **Step 3: Run the full test suite**

```bash
bun test
```

Expected: all tests pass; no newly skipped diagram tests.

- [ ] **Step 4: Start the development annotate flow with a fixture**

Create a temporary markdown fixture outside tracked source containing:

- two Mermaid diagrams so occurrence indexing is exercised;
- one Graphviz diagram;
- named nodes, labeled edges, and multi-word node text.

Run the repository's local annotate command through the existing development harness. Do not add the fixture to git.

- [ ] **Step 5: Verify in the browser**

For Mermaid and Graphviz, inline and expanded:

- hover recognized nodes/edges and confirm practical edge targets;
- click a node/edge and submit a normal comment;
- drag from a node, edge, label, and background and confirm pan without a popover;
- select SVG text where supported and confirm one text comment;
- wheel zoom and Shift/horizontal pan with mouse and trackpad;
- confirm pin position and constant size during zoom, pan, fit, resize, and expand/collapse;
- click pins and sidebar cards in both directions;
- edit/delete comments and reload a draft;
- copy/open a share URL and verify restored pins/context;
- inspect exported feedback wording;
- verify source view and read-only shared/archive views do not create comments;
- verify light/dark theme contrast and no console errors.

- [ ] **Step 6: Inspect the final diff**

```bash
git status --short
git diff --check
git diff --stat origin/main...HEAD
git log --oneline --decorate -12
```

Confirm no generated bundles, temporary fixtures, unrelated files, or GitHub metadata changes are included.

- [ ] **Step 7: Request code review**

Invoke `superpowers:requesting-code-review` and address actionable findings with `superpowers:receiving-code-review`. Re-run the affected focused tests after each correction.

- [ ] **Step 8: Final verification commit if needed**

If browser QA or review required fixes:

Stage only the exact corrected paths shown by `git status --short`, then run:

```bash
git commit -m "fix(ui): harden diagram comment interactions"
```

Do not push unless the user explicitly asks after reviewing the completed implementation.

---

## Definition of Done

- A simple click on a recognized Mermaid or Graphviz node/edge opens the existing comment box without a separate mode or button.
- Pointer wobble still clicks; click-hold-move pans and never opens the comment box.
- Valid SVG text selection creates one text-target comment when browser support permits it.
- Wheel zoom, horizontal navigation, fit, resize, source view, expanded view, and touch page scrolling retain their current behavior.
- Accessible, constant-size pins track resolved targets and select the existing sidebar cards.
- Semantic identity wins restoration; unchanged fingerprints permit positional fallback; unsafe matches are visibly unresolved.
- Full-object drafts, legacy tuple drafts, share URLs, linked documents, sidebar cards, and exported feedback preserve useful diagram context.
- Focused tests, repository typecheck, build, full test suite, browser QA, diff inspection, and code review are complete.
