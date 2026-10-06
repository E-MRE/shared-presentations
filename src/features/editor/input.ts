import { findHtmlEntry } from '../../content/bundler';
import { extractZipArchive } from '../../content/zip';
import { isPathTraversal, normalizePath, stripCommonRoot } from '../../content/paths';
import type { BundleFile, PipelineInput } from '../../content/types';
import { MAX_HTML_FILE_COUNT, MAX_HTML_UNPACKED_BYTES, MAX_PPTX_BYTES } from '../../contracts/limits';
export class EditorInputError extends Error {}
export interface SelectedInput { input: PipelineInput; candidates: string[]; entry: string; }

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
    const data = new Uint8Array(await files[index].arrayBuffer());
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
