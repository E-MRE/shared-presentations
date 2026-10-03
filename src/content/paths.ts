/**
 * Safe Path Resolution, Normalization, and URL Classification
 *
 * Implements strict traversal rejection (dots, drive letters, backslashes, encoded traversal),
 * nested relative path resolution, and URL classification.
 */

const WINDOWS_DRIVE_REGEX = /^[a-zA-Z]:/;
const DANGEROUS_SCHEME_REGEX = /^(?:javascript:|vbscript:|data\s*:\s*text\/html)/i;

/** Classification category for a referenced URL */
export type UrlCategory =
  | 'relative'
  | 'external-https'
  | 'external-http'
  | 'external-protocol-relative'
  | 'data-uri'
  | 'blob-uri'
  | 'fragment-only'
  | 'dangerous'
  | 'external-other';

/**
 * Normalizes a relative POSIX file path.
 * Decodes percent-encoded characters, normalizes slashes, and resolves dot-segments.
 * Throws or returns empty string if path attempts directory traversal escaping the root.
 */
export function normalizePath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') {
    return '';
  }

  // Reject null bytes immediately
  if (rawPath.includes('\0')) {
    return '';
  }

  // Convert Windows backslashes to forward slashes
  let p = rawPath.replace(/\\/g, '/').trim();

  // Decode percent-encoded components to catch %2e%2e (%2E%2E)
  try {
    p = decodeURIComponent(p);
  } catch {
    // Malformed URI encoding
    return '';
  }

  // Check for Windows drive letter
  if (WINDOWS_DRIVE_REGEX.test(p)) {
    return '';
  }

  // Strip leading slashes
  while (p.startsWith('/')) {
    p = p.slice(1);
  }

  const segments = p.split('/');
  const resolved: string[] = [];

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed || trimmed === '.') {
      continue;
    }
    if (trimmed === '..') {
      if (resolved.length === 0) {
        // Attempting to escape root
        return '';
      }
      resolved.pop();
    } else {
      resolved.push(trimmed);
    }
  }

  return resolved.join('/');
}

/**
 * Checks whether a given path attempts directory traversal or uses forbidden constructs.
 */
export function isPathTraversal(rawPath: string): boolean {
  if (!rawPath || typeof rawPath !== 'string') {
    return true;
  }
  if (rawPath.includes('\0')) {
    return true;
  }
  const backslashConverted = rawPath.replace(/\\/g, '/').trim();
  if (WINDOWS_DRIVE_REGEX.test(backslashConverted)) {
    return true;
  }
  if (backslashConverted.startsWith('/')) {
    return true;
  }

  let decoded = rawPath.trim();
  try {
    decoded = decodeURIComponent(rawPath).trim();
  } catch {
    return true;
  }

  if (decoded.includes('\0')) {
    return true;
  }

  const normalizedDecoded = decoded.replace(/\\/g, '/').trim();
  if (WINDOWS_DRIVE_REGEX.test(normalizedDecoded)) {
    return true;
  }
  if (normalizedDecoded.startsWith('/')) {
    return true;
  }

  const parts = normalizedDecoded.split('/');
  let depth = 0;
  for (const part of parts) {
    const p = part.trim();
    if (p === '..') {
      depth--;
      if (depth < 0) {
        return true;
      }
    } else if (p && p !== '.') {
      depth++;
    }
  }

  return false;
}

/**
 * Separates query string and hash fragment from a reference path.
 */
export function stripQueryAndHash(urlOrPath: string): { cleanPath: string; query: string; hash: string } {
  let cleanPath = urlOrPath;
  let hash = '';
  let query = '';

  const hashIdx = cleanPath.indexOf('#');
  if (hashIdx !== -1) {
    hash = cleanPath.slice(hashIdx);
    cleanPath = cleanPath.slice(0, hashIdx);
  }

  const queryIdx = cleanPath.indexOf('?');
  if (queryIdx !== -1) {
    query = cleanPath.slice(queryIdx);
    cleanPath = cleanPath.slice(0, queryIdx);
  }

  return { cleanPath, query, hash };
}

/**
 * Resolves a relative path from a containing directory.
 * E.g., containingDir = 'css', target = '../images/logo.png' -> 'images/logo.png'.
 * Returns empty string if resolved path attempts traversal above bundle root.
 */
export function resolveRelativePath(containingDir: string, targetPath: string): string {
  const { cleanPath } = stripQueryAndHash(targetPath);
  if (!cleanPath) {
    return '';
  }

  // If target begins with '/', treat as root-relative inside bundle
  if (cleanPath.startsWith('/')) {
    return normalizePath(cleanPath);
  }

  const combined = containingDir ? `${containingDir}/${cleanPath}` : cleanPath;
  return normalizePath(combined);
}

/**
 * Extracts directory name from a relative file path.
 * E.g. 'css/sub/style.css' -> 'css/sub', 'index.html' -> ''
 */
export function getDirectoryName(filePath: string): string {
  const norm = filePath.replace(/\\/g, '/');
  const lastSlash = norm.lastIndexOf('/');
  if (lastSlash === -1) {
    return '';
  }
  return norm.slice(0, lastSlash);
}

/**
 * Classifies a URL reference to determine how it should be handled.
 */
export function classifyUrl(url: string): UrlCategory {
  if (!url || typeof url !== 'string') {
    return 'relative';
  }
  const trimmed = url.trim();

  if (trimmed.startsWith('#')) {
    return 'fragment-only';
  }
  if (DANGEROUS_SCHEME_REGEX.test(trimmed)) {
    return 'dangerous';
  }
  if (trimmed.startsWith('data:')) {
    return 'data-uri';
  }
  if (trimmed.startsWith('blob:')) {
    return 'blob-uri';
  }
  if (trimmed.startsWith('//')) {
    return 'external-protocol-relative';
  }
  if (trimmed.startsWith('https://')) {
    return 'external-https';
  }
  if (trimmed.startsWith('http://')) {
    return 'external-http';
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return 'external-other';
  }
  return 'relative';
}

/**
 * Strips common root directory if all entries reside within a single top-level folder.
 */
export function stripCommonRoot(paths: string[]): { prefix: string; strippedMap: Map<string, string> } {
  const result = new Map<string, string>();
  if (paths.length === 0) {
    return { prefix: '', strippedMap: result };
  }

  // Filter out any directory markers (ending in /)
  const validFiles = paths.filter((p) => !p.endsWith('/'));
  if (validFiles.length === 0) {
    return { prefix: '', strippedMap: result };
  }

  // Check if every path shares the same first segment
  const firstParts = validFiles.map((p) => p.split('/')[0]);
  const candidatePrefix = firstParts[0];

  const allSharePrefix =
    candidatePrefix &&
    validFiles.every((p) => p.startsWith(candidatePrefix + '/') && p.length > candidatePrefix.length + 1);

  if (allSharePrefix) {
    const prefixWithSlash = candidatePrefix + '/';
    for (const p of paths) {
      if (p.startsWith(prefixWithSlash)) {
        result.set(p, p.slice(prefixWithSlash.length));
      } else {
        result.set(p, p);
      }
    }
    return { prefix: prefixWithSlash, strippedMap: result };
  }

  for (const p of paths) {
    result.set(p, p);
  }
  return { prefix: '', strippedMap: result };
}
