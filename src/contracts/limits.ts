/**
 * Shared System Limits and Sizing Constants
 *
 * Single source of truth for Firestore Security Rules, client-side validation,
 * and data service pipeline invariants.
 *
 * References:
 * - docs/PLAN.md §5, §7 (Binding Decisions 3, 9)
 * - docs/BRIEF.md §1, §4, §5
 */

/** Maximum pending presentation submissions allowed per user at any time */
export const MAX_PENDING_PER_USER = 5;

/** Maximum length for presentation title */
export const MAX_TITLE_LENGTH = 120;

/** Maximum length for presentation description */
export const MAX_DESCRIPTION_LENGTH = 2000;

/** Maximum number of external resource links */
export const MAX_LINKS_COUNT = 10;

/** Maximum character length of a single link label */
export const MAX_LINK_LABEL_LENGTH = 100;

/** Maximum character length of a single link URL */
export const MAX_LINK_URL_LENGTH = 1000;

/**
 * Hard cap for binary cover thumbnail in bytes.
 * Target is ~100 KB; rules allow up to 150,000 bytes.
 */
export const MAX_COVER_BYTES = 150000;

/** Maximum number of chunks allowed per presentation */
export const MAX_CHUNKS_COUNT = 12;

/** Minimum number of chunks allowed per presentation */
export const MIN_CHUNKS_COUNT = 1;

/** Maximum byte size of any single Firestore chunk */
export const MAX_CHUNK_BYTES = 900000; // 900 KB

/** Maximum gzip-encoded byte size for HTML presentations (5 MB) */
export const MAX_HTML_ENCODED_BYTES = 5 * 1024 * 1024; // 5,242,880 bytes

/** Maximum byte size for PPTX presentations stored as identity (8 MB) */
export const MAX_PPTX_BYTES = 8 * 1024 * 1024; // 8,388,608 bytes

/**
 * Browser-only limit: maximum unpacked size for HTML bundle (25 MB).
 * Enforced in the browser before upload; rules do NOT validate unpacked size.
 * (Operator Decision 3)
 */
export const MAX_HTML_UNPACKED_BYTES = 25 * 1024 * 1024; // 26,214,400 bytes

/**
 * Browser-only limit: maximum total file count inside an HTML bundle.
 * Enforced in the browser before upload; rules do NOT validate file count.
 * (Operator Decision 3)
 */
export const MAX_HTML_FILE_COUNT = 300;

/** Canonical manifest version */
export const MANIFEST_VERSION = 1;

/**
 * Limit definitions exported as a structured object for automated parity
 * tests between TypeScript constants and firestore.rules.
 */
export const RULES_LIMITS_MAP = {
  MAX_PENDING_PER_USER,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_LINKS_COUNT,
  MAX_LINK_LABEL_LENGTH,
  MAX_LINK_URL_LENGTH,
  MAX_COVER_BYTES,
  MAX_CHUNKS_COUNT,
  MIN_CHUNKS_COUNT,
  MAX_CHUNK_BYTES,
  MAX_HTML_ENCODED_BYTES,
  MAX_PPTX_BYTES,
  MANIFEST_VERSION,
} as const;
