/**
 * MIME Type Resolution and Binary Conversion Utilities
 */

const EXTENSION_MIME_MAP: Record<string, string> = {
  html: 'text/html;charset=utf-8',
  htm: 'text/html;charset=utf-8',
  css: 'text/css;charset=utf-8',
  js: 'text/javascript;charset=utf-8',
  mjs: 'text/javascript;charset=utf-8',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml;charset=utf-8',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  xml: 'application/xml',
  txt: 'text/plain;charset=utf-8',
};

/**
 * Returns the MIME type corresponding to a file path or extension.
 */
export function getMimeType(filePath: string): string {
  const clean = filePath.split('?')[0].split('#')[0];
  const lastDot = clean.lastIndexOf('.');
  if (lastDot === -1) {
    return 'application/octet-stream';
  }
  const ext = clean.slice(lastDot + 1).toLowerCase();
  return EXTENSION_MIME_MAP[ext] || 'application/octet-stream';
}

/**
 * Converts a Uint8Array to a base64 encoded string using chunked buffer slicing.
 * Avoids call stack overflow when handling large payloads.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Converts a base64 string to a Uint8Array.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes binary data into a Data URI with the appropriate MIME type.
 */
export function toDataUri(bytes: Uint8Array, mimeType: string): string {
  const base64 = bytesToBase64(bytes);
  return `data:${mimeType};base64,${base64}`;
}
