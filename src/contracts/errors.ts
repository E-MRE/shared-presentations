/**
 * Application Error Codes and Error Interfaces
 *
 * All data services return typed results wrapping AppError; they never throw raw exceptions to the UI.
 * References:
 * - docs/PLAN.md §5
 * - docs/BRIEF.md §4, §8
 */

export enum AppErrorCode {
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  UNVERIFIED_EMAIL = 'UNVERIFIED_EMAIL',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  FILE_COUNT_EXCEEDED = 'FILE_COUNT_EXCEEDED',
  CHUNK_TOO_LARGE = 'CHUNK_TOO_LARGE',
  MALFORMED_MANIFEST = 'MALFORMED_MANIFEST',
  INVALID_COVER = 'INVALID_COVER',
  DECK_IMMUTABLE = 'DECK_IMMUTABLE',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/** Structured application error returned by all data service and pipeline functions */
export interface AppError {
  /** Canonical machine-readable error code */
  code: AppErrorCode;
  /** Human-readable explanation in Turkish or English suitable for logs/UI */
  message: string;
  /** Optional technical details or underlying error cause */
  details?: unknown;
}
