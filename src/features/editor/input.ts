import { findHtmlEntry } from '../../content/bundler';
import { extractZipArchive } from '../../content/zip';
import { isPathTraversal, normalizePath, stripCommonRoot } from '../../content/paths';
import type { BundleFile, PipelineInput } from '../../content/types';
import { MAX_HTML_FILE_COUNT, MAX_HTML_UNPACKED_BYTES, MAX_PPTX_BYTES } from '../../contracts/limits';
export class EditorInputError extends Error {}
export interface SelectedInput { input: PipelineInput; candidates: string[]; entry: string; }

/** Drain directory batches (browsers often return 100 entries at a time). */
export async function readDroppedFiles(transfer: DataTransfer): Promise<{ files: File[]; directory: boolean }> {
  const entries = Array.from(transfer.items).filter(item => item.kind === 'file').map(item => item.webkitGetAsEntry?.());
  if (!entries.some(entry => entry?.isDirectory)) {
    const files = Array.from(transfer.files);
    if (files.length > MAX_HTML_FILE_COUNT) throw new EditorInputError('En fazla 300 dosya seçebilirsiniz.');
    if (files.reduce((sum, file) => sum + file.size, 0) > MAX_HTML_UNPACKED_BYTES) throw new EditorInputError('Dosyaların toplam boyutu en fazla 25 MB olabilir.');
    return { files, directory: files.length > 1 };
  }
  const files: File[] = [];
  let bytes = 0;
  async function visit(entry: FileSystemEntry, parent = '', depth = 0): Promise<void> {
    if (depth > 100) throw new EditorInputError('Klasör yapısı çok derin. ZIP olarak seçmeyi deneyin.');
    const path = parent + entry.name;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      bytes += file.size;
      if (files.length >= MAX_HTML_FILE_COUNT || bytes > MAX_HTML_UNPACKED_BYTES) throw new EditorInputError('Klasör en fazla 300 dosya ve toplam 25 MB olabilir.');
      Object.defineProperty(file, 'webkitRelativePath', { value: path }); files.push(file);
    } else {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await visit(child, path + '/', depth + 1);
      }
    }
  }
  for (const entry of entries) if (entry) await visit(entry);
  return { files, directory: true };
}

/** Size and path guards run before allocating file buffers. Archive extraction is owned by content. */
export async function readPresentationFiles(files: File[], directory: boolean, current: () => boolean): Promise<SelectedInput> {
  if (!files.length) throw new EditorInputError('Sunum dosyası seçin.');
  if (files.length > MAX_HTML_FILE_COUNT) throw new EditorInputError(`En fazla ${MAX_HTML_FILE_COUNT} dosya seçebilirsiniz.`);
  const folder = directory || files.length > 1 || files.some(file => !!file.webkitRelativePath);
  const limit = !folder && /\.pptx$/i.test(files[0].name) ? MAX_PPTX_BYTES : MAX_HTML_UNPACKED_BYTES;
  if (files.reduce((sum, file) => sum + file.size, 0) > limit) throw new EditorInputError(limit === MAX_PPTX_BYTES ? 'PPTX dosyası en fazla 8 MB olabilir.' : 'HTML / ZIP / klasör toplamı en fazla 25 MB olabilir.');
  if (!folder && !/\.(html?|zip|pptx)$/i.test(files[0].name)) throw new EditorInputError('HTML, ZIP veya PPTX dosyası seçin.');
  const paths = files.map(file => file.webkitRelativePath || file.name);
  if (paths.some(path => isPathTraversal(path) || !normalizePath(path))) throw new EditorInputError('Güvensiz veya geçersiz dosya yolu.');
  const { strippedMap } = stripCommonRoot(paths);
  const normalized = paths.map(path => normalizePath(strippedMap.get(path) || path));
  if (new Set(normalized.map(path => path.toLowerCase())).size !== normalized.length) throw new EditorInputError('Birbiriyle çakışan dosya yolları.');
  const bundle: BundleFile[] = [];
  for (let index = 0; index < files.length; index++) {
    if (!current()) throw new EditorInputError('Oturum değişti.');
    let data: Uint8Array;
    try { data = new Uint8Array(await files[index].arrayBuffer()); }
    catch { throw new EditorInputError('Seçilen dosya okunamadı. Dosyanın cihazınızda bulunduğunu kontrol edip yeniden seçin.'); }
    if (!current()) throw new EditorInputError('Oturum değişti.');
    bundle.push({ path: normalized[index], data, size: data.length, name: files[index].name });
  }
  if (!folder && /\.pptx$/i.test(files[0].name)) return { input: { kind: 'pptx', fileName: files[0].name, data: bundle[0].data }, candidates: [], entry: '' };
  if (!folder && /\.html?$/i.test(files[0].name)) return { input: { kind: 'single-html', fileName: files[0].name, content: bundle[0].data }, candidates: [], entry: '' };
  let entries = bundle;
  if (!folder) {
    const archive = await extractZipArchive(bundle[0].data);
    if (!current()) throw new EditorInputError('Oturum değişti.');
    if (!archive.ok) throw new EditorInputError(archive.error.message);
    entries = archive.value.files;
  }
  const entry = findHtmlEntry(entries);
  if (!entry.ok) throw new EditorInputError(entry.error.message);
  const candidates = entries.filter(file => /\.html?$/i.test(file.path)).map(file => file.path).sort();
  return { input: folder ? { kind: 'folder', files: bundle.map((file, index) => ({ path: paths[index], data: file.data, name: file.name })) } : { kind: 'zip', fileName: files[0].name, data: bundle[0].data }, candidates, entry: candidates.length > 1 ? '' : entry.value.path };
}
