/**
 * Content Pipeline Types and Interfaces
 *
 * References:
 * - src/contracts/content.ts
 * - src/contracts/models.ts
 * - src/contracts/limits.ts
 * - docs/PLAN.md §5, §7
 * - docs/BRIEF.md §1
 */

import type { DeckKind, CoverSource, DeckSizes, ChunkManifestEntry } from '../contracts/models';
import type { PreparedChunk, CoverDescriptor, PreparedContent } from '../contracts/content';

export type { DeckKind, CoverSource, DeckSizes, ChunkManifestEntry, PreparedChunk, CoverDescriptor, PreparedContent };

/** Normalized file entry representing an in-memory or extracted file */
export interface BundleFile {
  /** Relative POSIX path normalized without leading slash or dot-segments */
  path: string;
  /** Binary data */
  data: Uint8Array;
  /** Optional original filename */
  name?: string;
  /** Size in bytes */
  size: number;
}

/** Supported input forms for the content pipeline */
export type PipelineInput =
  | { kind: 'single-html'; fileName: string; content: string | Uint8Array }
  | { kind: 'folder'; files: Array<{ path: string; data: Uint8Array | string; name?: string }>; entryPath?: string }
  | { kind: 'zip'; fileName: string; data: Uint8Array; entryPath?: string }
  | { kind: 'pptx'; fileName: string; data: Uint8Array };

/** Options for presentation processing and bundling */
export interface PipelineOptions {
  /** Explicit title override (defaults to extracted HTML title or sanitized filename) */
  title?: string;
  /** Explicit cover image override provided by user */
  coverOverride?: Blob | Uint8Array;
  /** Explicitly selected HTML entry file inside folder/ZIP */
  entrySelection?: string;
  /** Timeout in ms for sandboxed cover capture (default: 8000ms) */
  captureTimeoutMs?: number;
  /** Whether to bypass automatic cover capture */
  skipAutoCover?: boolean;
}

/** Warning emitted during content processing */
export interface PipelineWarning {
  /** Warning categorization code */
  code:
    | 'EXTERNAL_RESOURCE'
    | 'INSECURE_RESOURCE'
    | 'MISSING_RESOURCE'
    | 'CYCLE_DETECTED'
    | 'UNSUPPORTED_CONSTRUCT'
    | 'COVER_CAPTURE_FAILED'
    | 'NORMALIZATION_NOTE';
  /** Human-readable warning description */
  message: string;
  /** Affected URL or file path if applicable */
  target?: string;
  /** Additional diagnostic details */
  details?: unknown;
}

/** Result of pipeline execution including warnings */
export interface PipelineResult extends PreparedContent {
  /** Extracted or resolved deck title */
  title: string;
  /** Observable warnings accumulated during pipeline execution */
  warnings: PipelineWarning[];
}

/** Result of decompressing and reconstructing a presentation */
export interface ReconstructedPresentation {
  /** Content format */
  kind: DeckKind;
  /** Original file name if available */
  fileName?: string;
  /** Bundled HTML text (for kind == 'html') */
  html?: string;
  /** Raw decompressed or identity bytes */
  rawBytes: Uint8Array;
  /** Sizing verification */
  sizes: DeckSizes;
  /** Chunk manifest verified */
  manifest: ChunkManifestEntry[];
}
