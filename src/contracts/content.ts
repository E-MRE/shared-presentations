/**
 * Content Pipeline and Bundling Contracts
 *
 * References:
 * - docs/PLAN.md §5, §7 (Binding Decisions 9, 10)
 * - docs/BRIEF.md §1
 */

import type { CoverSource, DeckKind, DeckSizes, ChunkManifestEntry } from './models';

/** Cover image descriptor for thumbnail operations */
export interface CoverDescriptor {
  /** Binary raw bytes of the thumbnail image (JPEG/WebP) */
  bytes: Uint8Array;
  /** Origin source of the thumbnail */
  source: CoverSource;
  /** MIME type of the cover image */
  mimeType: 'image/jpeg' | 'image/webp' | 'image/png';
}

/** Individual chunk data ready for batch write to Firestore */
export interface PreparedChunk {
  /** 0-based sequence index */
  index: number;
  /** Binary chunk payload (Bytes) */
  data: Uint8Array;
  /** Exact byte size */
  size: number;
}

/**
 * Result of client-side packaging and bundling before Firestore commit.
 * Produced by L04 content pipeline, consumed by L08 upload/edit and L03 data service.
 */
export interface PreparedContent {
  /** Content format */
  kind: DeckKind;
  /** Original file or bundle name */
  fileName: string;
  /** Total encoded bytes (gzip for HTML, raw for PPTX) */
  encodedData: Uint8Array;
  /** Sizing metrics */
  sizes: DeckSizes;
  /** Ordered array of chunk payloads to be written to `chunks/{index}` */
  chunks: PreparedChunk[];
  /** Manifest mapping each chunk index to its exact size */
  manifest: ChunkManifestEntry[];
  /** Default generated fallback cover */
  defaultCover: CoverDescriptor;
  /** Automatically captured cover from sandboxed preview if available */
  autoCover?: CoverDescriptor;
  /** Manifest format version */
  manifestVersion: number;
}
