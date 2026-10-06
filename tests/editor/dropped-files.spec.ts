import { describe, it, expect } from 'vitest';
import { readDroppedFiles } from '../../src/features/editor/input';
function fileEntry(name: string, size = 1) { return { name, isFile: true, isDirectory: false, file: (done: (file: File) => void) => done(new File([new Uint8Array(size)], name)) } as FileSystemFileEntry; }
function directoryEntry(batches: FileSystemEntry[][]) { let next = 0; return { name: 'slides', isFile: false, isDirectory: true, createReader: () => ({ readEntries: (done: (batch: FileSystemEntry[]) => void) => done(batches[next++] ?? []) }) } as FileSystemDirectoryEntry; }
function transfer(entry: FileSystemEntry) { return { items: [{ kind: 'file', webkitGetAsEntry: () => entry }], files: [] } as unknown as DataTransfer; }
describe('directory drop preparation', () => {
  it('drains multiple directory batches and preserves relative file paths', async () => {
    const result = await readDroppedFiles(transfer(directoryEntry([Array.from({ length: 100 }, (_, i) => fileEntry(`${i}.css`)), [fileEntry('index.html')]])));
    expect(result.directory).toBe(true); expect(result.files).toHaveLength(101); expect(result.files[100].webkitRelativePath).toBe('slides/index.html');
  });
  it('rejects a directory exceeding the file limit', async () => {
    await expect(readDroppedFiles(transfer(directoryEntry([Array.from({ length: 301 }, (_, i) => fileEntry(`${i}.html`))])))).rejects.toThrow('300');
  });
  it('rejects oversized loose-file drops before further processing', async () => {
    const file = new File(['x'], 'large.html'); Object.defineProperty(file, 'size', { value: 26 * 1024 * 1024 });
    await expect(readDroppedFiles({ items: [], files: [file] } as unknown as DataTransfer)).rejects.toThrow('25 MB');
  });
});
