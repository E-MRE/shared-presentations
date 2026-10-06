/**
 * Firestore Document Converters
 *
 * Converts raw Firestore snapshots into typed domain models (Deck, DeckChunk, UserProfile)
 * converting Firestore Bytes and Timestamps to Uint8Array and Date objects.
 *
 * References:
 * - src/contracts/models.ts
 */

import type { DocumentData } from 'firebase/firestore';
import type { Deck, DeckChunk, UserProfile } from '../contracts/models';
import { balancedManifest } from '../content/manifest';

/** Converts Firestore timestamp or date to native Date */
function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  if (val instanceof Date) return val;
  return null;
}

/** Converts Firestore Bytes or Uint8Array to Uint8Array */
function toUint8Array(val: unknown): Uint8Array {
  if (val instanceof Uint8Array) return val;
  if (val && typeof val === 'object' && 'toUint8Array' in val && typeof (val as { toUint8Array: () => Uint8Array }).toUint8Array === 'function') {
    return (val as { toUint8Array: () => Uint8Array }).toUint8Array();
  }
  return new Uint8Array();
}

/** Maps a Firestore document data object to a Deck entity */
export function deckFromDoc(id: string, data: DocumentData): Deck {
  return {
    id,
    ownerUid: data.ownerUid || '',
    ownerName: data.ownerName || undefined,
    ownerPhotoURL: data.ownerPhotoURL || undefined,
    title: data.title || '',
    description: data.description || '',
    category: typeof data.category === 'string' ? data.category : '',
    tags: Array.isArray(data.tags) ? data.tags.filter((tag: unknown) => typeof tag === 'string') : [],
    links: Array.isArray(data.links) ? data.links : [],
    kind: data.kind || 'html',
    fileName: data.fileName || '',
    status: data.status || 'pending',
    rejectNote: data.rejectNote || '',
    cover: toUint8Array(data.cover),
    coverSource: data.coverSource || 'default',
    sizes: {
      encoded: data.sizes?.encoded || 0,
      unpacked: data.sizes?.unpacked || 0,
      fileCount: data.sizes?.fileCount || 1,
    },
    chunkCount: data.chunkCount || 0,
    chunks: data.manifestVersion === 2
      ? balancedManifest(data.sizes?.encoded, data.chunkCount)
      : Array.isArray(data.chunks) ? data.chunks : [],
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
    publishedAt: toDate(data.publishedAt),
    reviewedBy: data.reviewedBy || null,
    reviewedAt: toDate(data.reviewedAt),
    manifestVersion: data.manifestVersion || 1,
    quotaMarker: data.quotaMarker || id,
  };
}

/** Maps a Firestore chunk document data object to a DeckChunk entity */
export function deckChunkFromDoc(index: number, data: DocumentData): DeckChunk {
  return {
    index: typeof data.index === 'number' ? data.index : index,
    data: toUint8Array(data.data),
    ...(data.size !== undefined ? { size: data.size } : {}),
  };
}

/** Maps a Firestore user document data object to a UserProfile entity */
export function userProfileFromDoc(uid: string, data: DocumentData): UserProfile {
  return {
    uid,
    displayName: data.displayName || '',
    email: data.email || '',
    createdAt: toDate(data.createdAt) || new Date(),
    pendingCount: typeof data.pendingCount === 'number' ? data.pendingCount : 0,
    pendingDeckId: data.pendingDeckId || undefined,
  };
}
