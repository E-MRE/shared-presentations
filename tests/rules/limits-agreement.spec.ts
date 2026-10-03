import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
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
} from '../../src/contracts/limits';

describe('Limits Agreement (TypeScript Contracts vs firestore.rules)', () => {
  const rulesPath = path.resolve(__dirname, '../../firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  it('matches MAX_PENDING_PER_USER (5)', () => {
    expect(MAX_PENDING_PER_USER).toBe(5);
    expect(rulesContent).toContain(`pendingCount <= ${MAX_PENDING_PER_USER}`);
  });

  it('matches MAX_TITLE_LENGTH (120)', () => {
    expect(MAX_TITLE_LENGTH).toBe(120);
    expect(rulesContent).toContain(`title.size() <= ${MAX_TITLE_LENGTH}`);
  });

  it('matches MAX_DESCRIPTION_LENGTH (2000)', () => {
    expect(MAX_DESCRIPTION_LENGTH).toBe(2000);
    expect(rulesContent).toContain(`description.size() <= ${MAX_DESCRIPTION_LENGTH}`);
  });

  it('matches MAX_LINKS_COUNT (10)', () => {
    expect(MAX_LINKS_COUNT).toBe(10);
    expect(rulesContent).toContain(`links.size() <= ${MAX_LINKS_COUNT}`);
  });

  it('matches MAX_LINK_LABEL_LENGTH (100)', () => {
    expect(MAX_LINK_LABEL_LENGTH).toBe(100);
    expect(rulesContent).toContain(`label.size() <= ${MAX_LINK_LABEL_LENGTH}`);
  });

  it('matches MAX_LINK_URL_LENGTH (1000)', () => {
    expect(MAX_LINK_URL_LENGTH).toBe(1000);
    expect(rulesContent).toContain(`url.size() <= ${MAX_LINK_URL_LENGTH}`);
  });

  it('matches MAX_COVER_BYTES (150000)', () => {
    expect(MAX_COVER_BYTES).toBe(150000);
    expect(rulesContent).toContain(`cover.size() <= ${MAX_COVER_BYTES}`);
  });

  it('matches MAX_CHUNKS_COUNT (12) and MIN_CHUNKS_COUNT (1)', () => {
    expect(MAX_CHUNKS_COUNT).toBe(12);
    expect(MIN_CHUNKS_COUNT).toBe(1);
    expect(rulesContent).toContain(`chunkCount <= ${MAX_CHUNKS_COUNT}`);
    expect(rulesContent).toContain(`chunkCount >= ${MIN_CHUNKS_COUNT}`);
  });

  it('matches MAX_CHUNK_BYTES (900000)', () => {
    expect(MAX_CHUNK_BYTES).toBe(900000);
    expect(rulesContent).toContain(`size <= ${MAX_CHUNK_BYTES}`);
  });

  it('matches MAX_HTML_ENCODED_BYTES (5242880)', () => {
    expect(MAX_HTML_ENCODED_BYTES).toBe(5 * 1024 * 1024);
    expect(rulesContent).toContain(`sizes.encoded <= ${MAX_HTML_ENCODED_BYTES}`);
  });

  it('matches MAX_PPTX_BYTES (8388608)', () => {
    expect(MAX_PPTX_BYTES).toBe(8 * 1024 * 1024);
    expect(rulesContent).toContain(`sizes.encoded <= ${MAX_PPTX_BYTES}`);
  });

  it('matches MANIFEST_VERSION (1)', () => {
    expect(MANIFEST_VERSION).toBe(1);
    expect(rulesContent).toContain(`manifestVersion == ${MANIFEST_VERSION}`);
  });
});
