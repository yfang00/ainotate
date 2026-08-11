/**
 * Portable sharing utilities for Ainotate
 *
 * Enables sharing plan + annotations via URL hash using:
 * - Native CompressionStream/DecompressionStream (deflate-raw)
 * - Base64url encoding for URL safety
 *
 * Inspired by textarea.my's approach.
 */

import { AnnotationType, type Annotation, type DiagramAnnotationTarget, type ImageAttachment } from '../types';
import { compress, decompress } from '@ainotate/core/compress';
import { decrypt } from '@ainotate/core/crypto';

// Image in shareable format: plain string (old) or [path, name] tuple (new)
type ShareableImage = string | [string, string];

// Minimal shareable annotation format: [type, originalText, text?, author?, images?, quickLabel?]
export type ShareableAnnotation =
  | ['D', string, string | null, ShareableImage[]?]                    // Deletion: type, original, author, images
  | ['C', string, string, string | null, ShareableImage[]?, (1)?]      // Comment: type, original, comment, author, images, isQuickLabel
  | ['G', string, string | null, ShareableImage[]?];                   // Global Comment: type, comment, author, images

export interface SharePayload {
  p: string;  // plan markdown
  a: ShareableAnnotation[];
  g?: ShareableImage[];  // global attachments (path strings or [path, name] tuples)
  d?: (string | null)[];  // diffContext per annotation, parallel to `a`
  s?: (string | undefined)[];  // source per annotation (external tool identifier), parallel to `a`
  t?: (DiagramAnnotationTarget | null)[];  // diagram target per annotation, parallel to `a`
  h?: string;  // raw HTML content (direct HTML rendering mode)
  r?: 'html';  // render mode flag (omitted = markdown)
}

const DIAGRAM_RENDERERS = new Set(['mermaid', 'graphviz']);
const DIAGRAM_KINDS = new Set(['node', 'edge', 'text']);

/**
 * Accept a sidecar entry only when every field a pin depends on is present and
 * well-formed. Anything else is dropped: an annotation that loses its target
 * still opens as an ordinary comment, which is strictly better than a link that
 * fails to load or a pin placed from junk coordinates.
 */
function parseDiagramTarget(raw: unknown): DiagramAnnotationTarget | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const anchor = value.anchor as Record<string, unknown> | undefined;

  if (typeof value.renderer !== 'string' || !DIAGRAM_RENDERERS.has(value.renderer)) return undefined;
  if (typeof value.kind !== 'string' || !DIAGRAM_KINDS.has(value.kind)) return undefined;
  if (typeof value.blockFingerprint !== 'string' || !value.blockFingerprint) return undefined;
  if (typeof value.diagramIndex !== 'number' || !Number.isFinite(value.diagramIndex)) return undefined;
  if (!anchor || typeof anchor !== 'object') return undefined;
  if (typeof anchor.x !== 'number' || !Number.isFinite(anchor.x)) return undefined;
  if (typeof anchor.y !== 'number' || !Number.isFinite(anchor.y)) return undefined;

  const optionalString = (field: unknown): string | undefined => (
    typeof field === 'string' && field ? field : undefined
  );

  return {
    renderer: value.renderer as DiagramAnnotationTarget['renderer'],
    kind: value.kind as DiagramAnnotationTarget['kind'],
    anchor: { x: anchor.x, y: anchor.y },
    blockFingerprint: value.blockFingerprint,
    diagramIndex: value.diagramIndex,
    ...(optionalString(value.semanticKey) ? { semanticKey: value.semanticKey as string } : {}),
    ...(optionalString(value.label) ? { label: value.label as string } : {}),
    ...(optionalString(value.ownerLabel) ? { ownerLabel: value.ownerLabel as string } : {}),
    ...(optionalString(value.selectedText) ? { selectedText: value.selectedText as string } : {}),
    ...(value.unresolved === true ? { unresolved: true } : {}),
  };
}

/**
 * The diagram-target sidecar for a share payload, or null when no annotation
 * carries one — omitting `t` entirely keeps ordinary links the size they were.
 */
export function buildDiagramTargetArray(
  annotations: Annotation[],
): (DiagramAnnotationTarget | null)[] | null {
  const arr = annotations.map(a => a.diagramTarget ?? null);
  return arr.some(v => v !== null) ? arr : null;
}

/**
 * Re-attach a sidecar to freshly deserialized annotations. Positional, so a
 * short/absent/ragged sidecar simply leaves the remaining annotations as
 * ordinary comments rather than shifting targets onto the wrong ones.
 */
export function applyDiagramTargetArray(
  annotations: Annotation[],
  targets?: (DiagramAnnotationTarget | null)[] | null,
): Annotation[] {
  if (!Array.isArray(targets)) return annotations;
  return annotations.map((annotation, index) => {
    const target = parseDiagramTarget(targets[index]);
    return target ? { ...annotation, diagramTarget: target } : annotation;
  });
}

/**
 * Convert ShareableImage[] to ImageAttachment[] (handles old plain-string format)
 */
export function parseShareableImages(raw: ShareableImage[] | undefined): ImageAttachment[] | undefined {
  if (!raw?.length) return undefined;
  return raw.map(img => {
    if (typeof img === 'string') {
      // Old format: plain path string — derive name from filename
      const name = img.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image';
      return { path: img, name };
    }
    return { path: img[0], name: img[1] };
  });
}

/**
 * Convert ImageAttachment[] to ShareableImage[] for compact serialization
 */
export function toShareableImages(images: ImageAttachment[] | undefined): ShareableImage[] | undefined {
  if (!images?.length) return undefined;
  return images.map(img => [img.path, img.name]);
}

// Re-export compress/decompress from shared package (single source of truth)
export { compress, decompress };

/**
 * Convert full Annotation objects to minimal shareable format
 */
export function toShareable(annotations: Annotation[]): ShareableAnnotation[] {
  return annotations.map(ann => {
    const author = ann.author || null;
    const images = toShareableImages(ann.images);

    // Handle GLOBAL_COMMENT specially - it starts with 'G' (from GLOBAL_COMMENT)
    if (ann.type === AnnotationType.GLOBAL_COMMENT) {
      return ['G', ann.text || '', author, images] as ShareableAnnotation;
    }

    if (ann.type === AnnotationType.DELETION) {
      return ['D', ann.originalText, author, images] as ShareableAnnotation;
    }

    // COMMENT
    if (ann.isQuickLabel) {
      return ['C', ann.originalText, ann.text || '', author, images ?? undefined, 1] as ShareableAnnotation;
    }
    return ['C', ann.originalText, ann.text || '', author, images] as ShareableAnnotation;
  });
}

/**
 * Convert shareable format back to full Annotation objects
 * Note: blockId, offsets, and meta will need to be populated separately
 * by finding the text in the rendered document.
 */
export function fromShareable(
  data: ShareableAnnotation[],
  diffContexts?: (string | null)[] | null,
  sources?: (string | undefined)[] | null,
  diagramTargets?: (DiagramAnnotationTarget | null)[] | null,
): Annotation[] {
  const typeMap: Record<string, AnnotationType> = {
    'D': AnnotationType.DELETION,
    'C': AnnotationType.COMMENT,
    'G': AnnotationType.GLOBAL_COMMENT,
  };

  const restored = data.map((item, index) => {
    const type = item[0];

    // Handle global comments specially: ['G', text, author, images?]
    if (type === 'G') {
      const text = item[1] as string;
      const author = item[2] as string | null;
      const rawImages = item[3] as ShareableImage[] | undefined;

      return {
        id: `shared-${index}-${Date.now()}`,
        blockId: '',
        startOffset: 0,
        endOffset: 0,
        type: AnnotationType.GLOBAL_COMMENT,
        text: text || undefined,
        originalText: '',
        createdA: Date.now() + index,
        author: author || undefined,
        images: parseShareableImages(rawImages),
        ...(sources?.[index] ? { source: sources[index] } : {}),
      };
    }

    const originalText = item[1];
    // For deletion: [type, original, author, images?]
    // For others: [type, original, text, author, images?]
    const text = type === 'D' ? undefined : item[2] as string;
    const author = type === 'D' ? item[2] as string | null : item[3] as string | null;
    const rawImages = type === 'D' ? item[3] as ShareableImage[] | undefined : item[4] as ShareableImage[] | undefined;
    // Comment annotations may have isQuickLabel flag at index 5
    const isQuickLabel = type === 'C' && item.length > 5 && item[5] === 1 ? true : undefined;

    return {
      id: `shared-${index}-${Date.now()}`,
      blockId: '',  // Will be populated during highlight restoration
      startOffset: 0,
      endOffset: 0,
      type: typeMap[type],
      text: text || undefined,
      originalText,
      createdA: Date.now() + index,  // Preserve order
      author: author || undefined,
      images: parseShareableImages(rawImages),
      ...(isQuickLabel ? { isQuickLabel } : {}),
      ...(diffContexts?.[index] ? { diffContext: diffContexts[index] as Annotation['diffContext'] } : {}),
      ...(sources?.[index] ? { source: sources[index] } : {}),
      // startMeta/endMeta will be set by web-highlighter
    };
  });

  return applyDiagramTargetArray(restored, diagramTargets);
}

function buildDiffContextArray(annotations: Annotation[]): (string | null)[] | null {
  const arr = annotations.map(a => a.diffContext || null);
  return arr.some(v => v !== null) ? arr : null;
}

function buildSourceArray(annotations: Annotation[]): (string | undefined)[] | null {
  const arr = annotations.map(a => a.source || undefined);
  return arr.some(v => v !== undefined) ? arr : null;
}

/**
 * Generate a full shareable URL from plan and annotations
 */
export async function generateShareUrl(
  markdown: string,
  annotations: Annotation[],
  globalAttachments?: ImageAttachment[],
  baseUrl: string = DEFAULT_SHARE_BASE,
  rawHtml?: string,
): Promise<string | null> {
  // HTML content is too large for URL hashes — force paste service path
  if (rawHtml) return null;
  const diffContexts = buildDiffContextArray(annotations);
  const sources = buildSourceArray(annotations);
  const diagramTargets = buildDiagramTargetArray(annotations);
  const payload: SharePayload = {
    p: markdown,
    a: toShareable(annotations),
    g: globalAttachments?.length ? toShareableImages(globalAttachments) : undefined,
    ...(diffContexts ? { d: diffContexts } : {}),
    ...(sources ? { s: sources } : {}),
    ...(diagramTargets ? { t: diagramTargets } : {}),
  };

  const hash = await compress(payload);
  return `${baseUrl}/#${hash}`;
}

/**
 * Parse a share URL hash and return the payload
 * Returns null if no valid hash or parsing fails
 */
export async function parseShareHash(): Promise<SharePayload | null> {
  const raw = window.location.hash.slice(1); // Remove leading #
  const hash = raw.split('?')[0]; // Strip callback params (?cb=...&ct=...)

  if (!hash) {
    return null;
  }

  try {
    return (await decompress(hash)) as SharePayload;
  } catch (e) {
    console.warn('Failed to parse share hash:', e);
    return null;
  }
}

/**
 * Get the size of a URL in a human-readable format
 */
export function formatUrlSize(url: string): string {
  const bytes = new Blob([url]).size;
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ---------------------------------------------------------------------------
// Short URL support (paste-service backed)
// ---------------------------------------------------------------------------

const DEFAULT_PASTE_API = 'https://ainotate-paste.ainotate.workers.dev';
const DEFAULT_SHARE_BASE = 'https://share.ainotate.ai';

export class ShortShareUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShortShareUrlError';
  }
}

/**
 * Create a short share URL by posting compressed plan data to the paste service.
 *
 * Returns `{ shortUrl, id }` on success, or `null` when the paste service is
 * unavailable (e.g. self-hosted environments without a paste backend). Callers
 * should fall back to the hash-based URL in that case.
 *
 * The request has a 5-second timeout so UI responsiveness is not affected.
 */
export async function createShortShareUrl(
  _markdown: string,
  _annotations: Annotation[],
  _globalAttachments?: ImageAttachment[],
  _options?: {
    /** Override the paste API base URL (default: https://ainotate-paste.ainotate.workers.dev) */
    pasteApiUrl?: string;
    /** Override the share site base URL used in the returned short link */
    shareBaseUrl?: string;
  },
  _rawHtml?: string,
): Promise<{ shortUrl: string; id: string } | null> {
  // SHARING REMOVED IN THIS FORK. This function used to POST (encrypted) plan
  // content to a remote paste service; it is now a hard no-op so no content can
  // leave the machine. Returning null makes callers fall back to local-only
  // behavior. The Share UI is never rendered anyway (resolveSharingEnabled is
  // forced false), so this path is not reachable in normal use.
  return null;
}

/**
 * Load plan data from a paste service using the paste ID embedded in a short URL.
 *
 * Fetches the compressed payload from `<pasteApiUrl>/api/paste/<pasteId>` and
 * decompresses it into a `SharePayload`. Returns `null` on any failure.
 */
export async function loadFromPasteId(
  pasteId: string,
  pasteApiUrl: string = DEFAULT_PASTE_API,
  encryptionKey?: string
): Promise<SharePayload | null> {
  try {
    const response = await fetch(`${pasteApiUrl}/api/paste/${pasteId}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(`[sharing] Paste fetch returned ${response.status} for id ${pasteId}`);
      return null;
    }

    const result = (await response.json()) as { data: string };

    if (encryptionKey) {
      // Encrypted path: decrypt ciphertext, then decompress
      const compressed = await decrypt(result.data, encryptionKey);
      return await decompress(compressed) as SharePayload;
    }

    // Legacy unencrypted path: decompress directly
    return await decompress(result.data) as SharePayload;
  } catch (e) {
    console.warn('[sharing] Failed to load from paste ID:', e);
    return null;
  }
}
