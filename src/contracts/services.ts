/**
 * Data Service Interfaces, Operations, and Pagination Types
 *
 * Every service operation returns a typed Result<T>, never throwing raw exceptions to the UI layer.
 * References:
 * - docs/PLAN.md §5, §7
 * - docs/BRIEF.md §5
 */

import type { AppError } from './errors';
import type { Deck, DeckLink, DeckKind, CoverSource, DeckSizes, ChunkManifestEntry, DeckChunk } from './models';
import type { PreparedChunk } from './content';

/** Standard discriminated union Result type */
export type Result<T, E = AppError> =
  | { ok: true; value: T; error?: never }
  | { ok: false; error: E; value?: never };

/** Helper to construct a successful result */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** Helper to construct a failed result */
export function err<T = never>(error: AppError): Result<T> {
  return { ok: false, error };
}

/** Pagination cursor token representing Firestore document snapshot boundary */
export interface PaginationCursor {
  /** Document ID of the boundary record */
  docId: string;
  /** Primary sort field value at boundary (e.g. timestamp or string) */
  sortValue?: string | number | null;
}

/** Input parameters for paginated queries */
export interface PaginatedQueryInput {
  /** Number of items requested per page (default: 12) */
  pageSize?: number;
  /** Starting cursor from a previous page (cursor in) */
  cursor?: PaginationCursor;
}

/** Output structure for paginated queries */
export interface PaginatedResult<T> {
  /** Array of records returned for this page */
  items: T[];
  /** Next cursor to fetch subsequent page, or null if no further items exist (cursor out) */
  nextCursor: PaginationCursor | null;
  /** Boolean convenience indicator if more items can be loaded */
  hasMore: boolean;
}

/** Parameters to create a new presentation */
export interface CreateDeckInput {
  title: string;
  description: string;
  category?: string;
  tags?: string[];
  links: DeckLink[];
  kind: DeckKind;
  fileName: string;
  cover: Uint8Array;
  coverSource: CoverSource;
  sizes: DeckSizes;
  chunkCount: number;
  chunks: PreparedChunk[];
  manifest: ChunkManifestEntry[];
}

/** Parameters to update an existing presentation */
export interface UpdateDeckInput {
  id: string;
  title: string;
  description: string;
  category?: string;
  tags?: string[];
  links: DeckLink[];
  cover?: Uint8Array;
  coverSource?: CoverSource;
  /** Optional replacement content payload (triggers tail cleanup if chunk count changes) */
  replacementContent?: {
    fileName: string;
    sizes: DeckSizes;
    chunkCount: number;
    chunks: PreparedChunk[];
    manifest: ChunkManifestEntry[];
  };
}

/** Parameters to review a presentation (Admin only) */
export interface ReviewDeckInput {
  id: string;
  action: 'approve' | 'reject' | 'unpublish' | 'reapprove';
  /** Required when action is 'reject' */
  rejectNote?: string;
}

/** Parameters to delete a presentation */
export interface DeleteDeckInput {
  id: string;
}

/** Data service contract consumed by UI features */
export interface PresentationDataService {
  /** Get single presentation metadata */
  getDeck(id: string): Promise<Result<Deck>>;

  /** Get chunk payload for presentation viewer / download */
  getChunk(deckId: string, index: number): Promise<Result<DeckChunk>>;

  /** Get all chunks for a deck in order */
  getAllChunks(deckId: string, chunkCount: number): Promise<Result<DeckChunk[]>>;

  /** Query published feed ordered by publishedAt DESC */
  getPublishedFeed(input: PaginatedQueryInput): Promise<Result<PaginatedResult<Deck>>>;

  /** Query user's own decks ordered by updatedAt DESC */
  getMyDecks(ownerUid: string, input: PaginatedQueryInput): Promise<Result<PaginatedResult<Deck>>>;

  /** Query admin review queue ordered by createdAt ASC */
  getReviewQueue(input: PaginatedQueryInput): Promise<Result<PaginatedResult<Deck>>>;

  /** Create new presentation (atomic batch: deck + chunks + quota increment) */
  createDeck(input: CreateDeckInput): Promise<Result<Deck>>;

  /** Update presentation (atomic batch: deck + optional replacement chunks + quota if status changed) */
  updateDeck(input: UpdateDeckInput): Promise<Result<Deck>>;

  /** Review presentation (Admin: approve / reject / unpublish / reapprove) */
  reviewDeck(input: ReviewDeckInput): Promise<Result<Deck>>;

  /** Delete presentation (atomic batch: deck + chunks cleanup + quota decrement if pending) */
  deleteDeck(input: DeleteDeckInput): Promise<Result<void>>;
}
