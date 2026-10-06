// Isolated profiler harness, never a deployable access policy.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Bytes, Timestamp, doc, setDoc } from 'firebase/firestore';
import { PROJECT_ID, hasEmulator, emuHost, emuPort } from '../emulator-config';

describe.skipIf(!hasEmulator)('Parent validator expression measurements', () => {
  it.each(['tags', 'links', 'other', 'stored'] as const)('measures %s independently with 8 tags and 10 links', async mode => {
    let source = readFileSync(new URL(mode === 'stored' ? '../../firestore.rules' : '../fixtures/firestore-parent-inline-links.rules', import.meta.url), 'utf8');
    source = source.slice(0, source.indexOf('    // --- Quota & Transaction'));
    if (mode === 'other') source = source.replace('areValidCatalog(data) &&', "(!('category' in data) || data.category in ['', 'Frontend & Flutter', 'AI & LLM', 'UI/UX & Design', 'Mimari & Backend']) &&").replace('areValidLinks(data.links) &&', '');
    const expression = mode === 'tags' ? 'areValidTags(data.tags)' : mode === 'links' ? 'areValidLinks(data.links)' : 'validateDeckFields(data) && validateManifest(data)';
    source += `function measurement(data) { return ${expression}; }\nmatch /sample/{id} { allow create: if measurement(request.resource.data); }\n} }`;
    const project = `${PROJECT_ID}-cost-${mode}`;
    const env = await initializeTestEnvironment({ projectId: project, firestore: { host: emuHost, port: emuPort, rules: source } });
    try {
      await env.clearFirestore();
      const db = env.authenticatedContext('owner', { email_verified: true }).firestore();
      await setDoc(doc(db, 'sample', 'one'), {
        ownerUid: 'owner', title: 'Cost', description: 'Measurement only',
        category: 'AI & LLM', tags: Array.from({ length: 8 }, (_, i) => `tag-${i}`),
        ...(mode === 'stored' ? { linkCount: 10 } : { links: Array.from({ length: 10 }, (_, i) => ({ label: `Link ${i}`, url: `https://example.com/${i}` })) }),
        kind: 'html', fileName: 'deck.html', status: 'pending', rejectNote: '',
        cover: Bytes.fromUint8Array(new Uint8Array([1, 2, 3, 4])), coverSource: 'auto',
        sizes: { encoded: 1201, unpacked: 2000, fileCount: 1 }, chunkCount: 12,
        manifestVersion: 2, quotaMarker: 'one', createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      });
      for (const [suffix, extension] of [['', 'json'], ['.html', 'html']]) {
        const response = await fetch(`http://${emuHost}:${emuPort}/emulator/v1/projects/${project}:ruleCoverage${suffix}`);
        expect(response.status).toBe(200);
        writeFileSync(resolve(process.env.EVIDENCE_DIR!, `parent-${mode}-coverage.${extension}`), await response.text());
      }
    } finally { await env.cleanup(); }
  });
});
