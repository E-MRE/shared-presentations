import { MAX_CHUNK_BYTES, MAX_CHUNKS_COUNT } from '../contracts/limits';
import type { ChunkManifestEntry } from '../contracts/models';
import type { PreparedChunk } from '../contracts/content';

/** v2 sizes are derivable from parent metadata; no stored parent manifest is needed. */
export function balancedManifest(encoded: number, count: number): ChunkManifestEntry[] {
  if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS_COUNT ||
      !Number.isInteger(encoded) || encoded < count || encoded > count * MAX_CHUNK_BYTES) return [];
  const base = Math.floor(encoded / count);
  const remainder = encoded % count;
  return Array.from({ length: count }, (_, index) => ({ index, size: base + (index < remainder ? 1 : 0) }));
}

/** Preserve byte order when caller-provided chunks use v1 partition boundaries. */
export function rebalanceChunks(chunks: PreparedChunk[], encoded: number, count: number): PreparedChunk[] {
  const manifest = balancedManifest(encoded, count);
  if (manifest.length !== count) throw new Error('Invalid v2 chunk sizing metadata');
  if (chunks.every((chunk, i) => chunk.data.length === manifest[i].size)) {
    return chunks.map(({ index, data }, i) => ({ index, data, size: manifest[i].size }));
  }
  const bytes = new Uint8Array(encoded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk.data, offset); offset += chunk.data.length; }
  offset = 0;
  return manifest.map(({ index, size }) => {
    const data = bytes.subarray(offset, offset + size);
    offset += size;
    return { index, size, data };
  });
}
