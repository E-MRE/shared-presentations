/**
 * Domain Models and Entity Interfaces
 *
 * References:
 * - docs/PLAN.md §5, §7
 * - docs/BRIEF.md §1, §5
 */

/** Lifecycle review status of a presentation deck */
export type DeckStatus = 'pending' | 'published' | 'rejected' | 'unpublished';

/** Content format of a presentation */
export type DeckKind = 'html' | 'pptx';

/** Source origin for the presentation cover thumbnail */
export type CoverSource = 'auto' | 'upload' | 'default';

/** External resource link associated with a deck */
export interface DeckLink {
  /** Display label for the link (max 100 chars) */
  label: string;
  /** Destination HTTPS URL (max 1000 chars) */
  url: string;
}

/** Size metrics for presentation payloads */
export interface DeckSizes {
  /** Gzip-compressed (HTML) or raw (PPTX) size in bytes stored across chunks */
  encoded: number;
  /** Unpacked size in bytes (browser-validated) */
  unpacked: number;
  /** Total count of files in the bundle (browser-validated) */
  fileCount: number;
}

/** Entry in the presentation chunks manifest */
export interface ChunkManifestEntry {
  /** 0-based chunk sequence index */
  index: number;
  /** Exact byte size of this chunk's payload */
  size: number;
}

/** Domain entity: includes links and manifest resolved from v1/v2 storage. */
export interface Deck {
  /** Document ID */
  id: string;
  /** Firebase Auth UID of the deck owner (immutable) */
  ownerUid: string;
  /** Display name of the owner at the time of creation */
  ownerName?: string;
  /** Photo URL of the owner if available */
  ownerPhotoURL?: string;
  /** Presentation title (max 120 chars) */
  title: string;
  /** Presentation description / abstract (max 2000 chars) */
  description: string;
  category?: string;
  tags?: string[];
  /** Resource links (max 10 items) */
  links: DeckLink[];
  /** Format type: 'html' or 'pptx' */
  kind: DeckKind;
  /** Original uploaded file/bundle name */
  fileName: string;
  /** Current review status */
  status: DeckStatus;
  /** Reason provided by admin when rejected (required if status == 'rejected') */
  rejectNote: string;
  /** Binary thumbnail bytes (JPEG or WebP, max 150000 bytes) */
  cover: Uint8Array;
  /** Origin source of the cover */
  coverSource: CoverSource;
  /** Sizing metadata */
  sizes: DeckSizes;
  /** Total number of chunk documents in `presentations/{id}/chunks` */
  chunkCount: number;
  /** v1 stored manifest or v2 manifest derived from total/count */
  chunks: ChunkManifestEntry[];
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Publication timestamp when approved by admin, or null */
  publishedAt: Date | null;
  /** UID of admin who reviewed this presentation, or null */
  reviewedBy: string | null;
  /** Timestamp when review decision was recorded, or null */
  reviewedAt: Date | null;
  /** Stored manifest schema version: legacy 1 or current 2 */
  manifestVersion: number;
  /** Quota transition binding marker tying deck creation/status to user quota */
  quotaMarker: string;
}

/** Individual chunk document in `presentations/{id}/chunks/{index}` */
export interface DeckChunk {
  /** 0-based decimal index of the chunk */
  index: number;
  /** Binary chunk payload (max 900,000 bytes) */
  data: Uint8Array;
  /** Explicit v2 storage size; absent on legacy v1 chunks. */
  size?: number;
}

/** User profile document in `users/{uid}` */
export interface UserProfile {
  /** User UID matching auth.uid */
  uid: string;
  /** User display name */
  displayName: string;
  /** User primary email */
  email: string;
  /** User creation timestamp */
  createdAt: Date;
  /** Number of pending decks submitted by this user (0 <= count <= 5) */
  pendingCount: number;
  /** Active deck ID bound to the latest pendingCount transition */
  pendingDeckId?: string;
}
