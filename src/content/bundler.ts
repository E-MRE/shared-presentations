/**
 * HTML Deck Bundler and Inlining Engine
 *
 * Inlines linked CSS, nested @import and url() assets (fonts, images),
 * linked JS, images, srcset, and SVGs into a self-contained HTML document.
 * Enforces expansion bounds, prevents cycle loops, and preserves unresolved external URLs with warnings.
 *
 * References:
 * - src/contracts/limits.ts
 * - src/contracts/errors.ts
 * - src/contracts/services.ts
 */

import {
  MAX_HTML_UNPACKED_BYTES,
  MAX_TITLE_LENGTH,
} from '../contracts/limits';
import { AppErrorCode } from '../contracts/errors';
import { ok, err, type Result } from '../contracts/services';
import {
  normalizePath,
  resolveRelativePath,
  getDirectoryName,
  classifyUrl,
  stripQueryAndHash,
} from './paths';
import { getMimeType, toDataUri } from './mime';
import type { BundleFile, PipelineWarning } from './types';

const TRANSPARENT_1X1_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Result of bundling HTML with accumulated warnings */
export interface BundledHtmlResult {
  html: string;
  entryPath: string;
  title: string;
  warnings: PipelineWarning[];
  unpackedBytes: number;
}

/**
 * Decodes HTML entities commonly found in titles, paths, and attributes.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/**
 * Derives a human-readable title from a filename.
 */
function titleFromFileName(fileName: string): string {
  const base = fileName.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Sunum';
  const words = base
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : 'Sunum';
}

/**
 * Finds the end of an HTML tag respecting single and double quotes in attributes,
 * so quoted '>' characters (e.g. title="a > b") do not end the tag early.
 */
function findTagEnd(html: string, start: number): number {
  let inQuote: string | null = null;
  for (let i = start + 1; i < html.length; i++) {
    const ch = html[i];
    if (inQuote !== null) {
      if (ch === inQuote) {
        inQuote = null;
      }
    } else {
      if (ch === '"' || ch === "'") {
        inQuote = ch;
      } else if (ch === '>') {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Replaces or updates an attribute in an HTML tag string safely.
 */
function replaceAttribute(tagStr: string, attrName: string, newValue: string): string {
  const regex = new RegExp(`(\\b${attrName}\\s*=\\s*)(?:'[^']*'|"[^"]*"|[^\\s>]+)`, 'i');
  if (regex.test(tagStr)) {
    return tagStr.replace(regex, (_match, prefix) => `${prefix}"${newValue}"`);
  }
  const isSelfClosing = tagStr.endsWith('/>');
  const insertPos = isSelfClosing ? tagStr.length - 2 : tagStr.length - 1;
  return `${tagStr.slice(0, insertPos)} ${attrName}="${newValue}"${tagStr.slice(insertPos)}`;
}

/**
 * Extracts the value of a specific attribute from an HTML tag string.
 */
function getAttributeValue(tagStr: string, attrName: string): string | null {
  const regex = new RegExp(`\\b${attrName}\\s*=\\s*(?:'([^']*)'|"([^"]*)"|([^\\s>]+))`, 'i');
  const match = tagStr.match(regex);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

/**
 * Parses srcset attribute respecting data URIs with commas,
 * inlining relative paths to data URIs.
 */
function processSrcset(
  srcset: string,
  containingDir: string,
  fileMap: Map<string, BundleFile>,
  warnings: PipelineWarning[],
): string {
  const candidates: Array<{ url: string; descriptor: string }> = [];
  let pos = 0;

  while (pos < srcset.length) {
    while (pos < srcset.length && /\s/.test(srcset[pos])) pos++;
    if (pos >= srcset.length) break;

    const urlStart = pos;
    const isData = srcset.slice(pos, pos + 5).toLowerCase() === 'data:';
    let dataCommaSeen = false;

    while (pos < srcset.length) {
      const ch = srcset[pos];
      if (/\s/.test(ch)) break;
      if (ch === ',') {
        if (isData && !dataCommaSeen) {
          dataCommaSeen = true;
          pos++;
          continue;
        }
        break;
      }
      pos++;
    }

    const rawUrl = srcset.slice(urlStart, pos);
    while (pos < srcset.length && /\s/.test(srcset[pos])) pos++;

    const descStart = pos;
    while (pos < srcset.length && srcset[pos] !== ',') pos++;
    const descriptor = srcset.slice(descStart, pos).trim();

    candidates.push({ url: rawUrl, descriptor });
    if (pos < srcset.length && srcset[pos] === ',') pos++;
  }

  const processed: string[] = [];
  for (const { url, descriptor } of candidates) {
    const decodedUrl = decodeHtmlEntities(url).trim();
    const category = classifyUrl(decodedUrl);

    if (category === 'data-uri' || category === 'fragment-only') {
      processed.push(descriptor ? `${url} ${descriptor}` : url);
      continue;
    }

    if (category === 'external-https' || category === 'external-protocol-relative') {
      warnings.push({
        code: 'EXTERNAL_RESOURCE',
        message: `Çözümlenmemiş harici srcset kaynağı: ${url}`,
        target: url,
      });
      processed.push(descriptor ? `${url} ${descriptor}` : url);
      continue;
    }

    if (category === 'external-http') {
      warnings.push({
        code: 'INSECURE_RESOURCE',
        message: `Güvensiz harici HTTP srcset kaynağı: ${url}`,
        target: url,
      });
      processed.push(descriptor ? `${url} ${descriptor}` : url);
      continue;
    }

    // Local relative file
    const { cleanPath, hash } = stripQueryAndHash(decodedUrl);
    const resolvedPath = resolveRelativePath(containingDir, cleanPath);
    const targetFile = fileMap.get(resolvedPath);

    if (targetFile) {
      const mime = getMimeType(resolvedPath);
      const dataUri = toDataUri(targetFile.data, mime) + (hash || '');
      processed.push(descriptor ? `${dataUri} ${descriptor}` : dataUri);
    } else {
      warnings.push({
        code: 'MISSING_RESOURCE',
        message: `Pakette bulunamayan yerel srcset kaynağı: ${url}`,
        target: url,
      });
      processed.push(
        descriptor ? `${TRANSPARENT_1X1_GIF} ${descriptor}` : TRANSPARENT_1X1_GIF,
      );
    }
  }

  return processed.join(', ');
}

/**
 * Inlines CSS rules, nested @import statements, and url(...) assets recursively.
 */
export function processCssContent(
  cssText: string,
  containingDir: string,
  fileMap: Map<string, BundleFile>,
  warnings: PipelineWarning[],
  visitedCssFiles: Set<string> = new Set(),
  memoizedCss: Map<string, string> = new Map(),
  depth = 0,
): string {
  if (depth > 15) {
    warnings.push({
      code: 'UNSUPPORTED_CONSTRUCT',
      message: 'CSS @import derinlik sınırı aşıldı (azami 15 düzey).',
      target: containingDir,
    });
    return cssText;
  }

  const CSS_TOKEN_REGEX =
    /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@import\s+(?:url\s*\(\s*(['"]?)(.*?)\1\s*\)|(['"])(.*?)\3|([^;\s]+))\s*([^;]*?);|url\s*\(\s*(['"]?)(.*?)\7\s*\)/gi;

  const result = cssText.replace(
    CSS_TOKEN_REGEX,
    (
      match,
      _importUrlQ1,
      importUrlVal1,
      _importUrlQ2,
      importUrlVal2,
      importUrlBare,
      importMedia,
      _urlQuote,
      urlValue,
    ) => {
      // 1. Comments: preserve verbatim
      if (match.startsWith('/*')) {
        return match;
      }

      // 2. Quoted string literals: preserve verbatim
      if (match.startsWith('"') || match.startsWith("'")) {
        return match;
      }

      // 3. @import statement
      if (match.toLowerCase().startsWith('@import')) {
        const importTarget = (
          importUrlVal1 ??
          importUrlVal2 ??
          importUrlBare ??
          ''
        ).trim();
        const media = (importMedia || '').trim();

        if (!importTarget) {
          return '/* empty @import */';
        }

        const category = classifyUrl(importTarget);
        if (category === 'external-https' || category === 'external-protocol-relative') {
          warnings.push({
            code: 'EXTERNAL_RESOURCE',
            message: `CSS içinde harici @import kaynağı: ${importTarget}`,
            target: importTarget,
          });
          return match;
        }

        if (category === 'external-http') {
          warnings.push({
            code: 'INSECURE_RESOURCE',
            message: `CSS içinde güvensiz HTTP @import kaynağı: ${importTarget}`,
            target: importTarget,
          });
          return match;
        }

        // Local relative CSS import
        const resolvedPath = resolveRelativePath(containingDir, importTarget);
        const { cleanPath } = stripQueryAndHash(resolvedPath);

        if (visitedCssFiles.has(cleanPath)) {
          warnings.push({
            code: 'CYCLE_DETECTED',
            message: `CSS @import döngüsü tespit edildi: ${cleanPath}`,
            target: cleanPath,
          });
          return `/* @import cycle skipped: ${importTarget} */`;
        }

        const nestedFile = fileMap.get(cleanPath);
        if (!nestedFile) {
          warnings.push({
            code: 'MISSING_RESOURCE',
            message: `Bulunamayan yerel CSS @import dosyası: ${importTarget}`,
            target: importTarget,
          });
          return `/* Missing @import: ${importTarget} */`;
        }

        const nextVisited = new Set(visitedCssFiles);
        nextVisited.add(cleanPath);

        let processedNested = memoizedCss.get(cleanPath);
        if (processedNested === undefined) {
          const nestedDir = getDirectoryName(cleanPath);
          const nestedText = new TextDecoder('utf-8').decode(nestedFile.data);
          processedNested = processCssContent(
            nestedText,
            nestedDir,
            fileMap,
            warnings,
            nextVisited,
            memoizedCss,
            depth + 1,
          );
          memoizedCss.set(cleanPath, processedNested);
        }

        if (media) {
          return `@media ${media} {\n${processedNested}\n}`;
        }
        return `\n/* Inlined @import: ${importTarget} */\n${processedNested}\n`;
      }

      // 4. url(...) expression
      if (urlValue !== undefined) {
        const rawUrl = urlValue.trim();
        if (!rawUrl) {
          return 'url("")';
        }

        const category = classifyUrl(rawUrl);
        if (category === 'data-uri' || category === 'fragment-only') {
          return match;
        }

        if (category === 'external-https' || category === 'external-protocol-relative') {
          warnings.push({
            code: 'EXTERNAL_RESOURCE',
            message: `CSS içinde harici url() kaynağı: ${rawUrl}`,
            target: rawUrl,
          });
          return match;
        }

        if (category === 'external-http') {
          warnings.push({
            code: 'INSECURE_RESOURCE',
            message: `CSS içinde güvensiz HTTP url() kaynağı: ${rawUrl}`,
            target: rawUrl,
          });
          return match;
        }

        if (category === 'dangerous') {
          warnings.push({
            code: 'UNSUPPORTED_CONSTRUCT',
            message: `CSS içinde geçersiz/güvensiz url() şeması: ${rawUrl}`,
            target: rawUrl,
          });
          return 'url("")';
        }

        // Local relative asset in url(...)
        const { cleanPath, hash } = stripQueryAndHash(rawUrl);
        const resolvedPath = resolveRelativePath(containingDir, cleanPath);
        const assetFile = fileMap.get(resolvedPath);

        if (assetFile) {
          const mime = getMimeType(resolvedPath);
          const dataUri = toDataUri(assetFile.data, mime) + (hash || '');
          return `url("${dataUri}")`;
        }

        warnings.push({
          code: 'MISSING_RESOURCE',
          message: `CSS içinde bulunamayan yerel url() kaynağı: ${rawUrl}`,
          target: rawUrl,
        });
        return `url("${TRANSPARENT_1X1_GIF}")`;
      }

      return match;
    },
  );

  return result;
}

interface JsToken {
  type: 'code' | 'comment' | 'string';
  text: string;
}

/**
 * Tokenizes JavaScript code into code chunks, comments, and string literals.
 * This prevents rewriting pseudo-imports inside strings or comments.
 */
function tokenizeJs(code: string): JsToken[] {
  const tokens: JsToken[] = [];
  let pos = 0;
  let codeStart = 0;

  while (pos < code.length) {
    const ch = code[pos];
    const next = code[pos + 1];

    // Single-line comment: // ... \n
    if (ch === '/' && next === '/') {
      if (pos > codeStart) {
        tokens.push({ type: 'code', text: code.slice(codeStart, pos) });
      }
      const end = code.indexOf('\n', pos + 2);
      const commentEnd = end === -1 ? code.length : end + 1;
      tokens.push({ type: 'comment', text: code.slice(pos, commentEnd) });
      pos = commentEnd;
      codeStart = pos;
      continue;
    }

    // Multi-line comment: /* ... */
    if (ch === '/' && next === '*') {
      if (pos > codeStart) {
        tokens.push({ type: 'code', text: code.slice(codeStart, pos) });
      }
      const end = code.indexOf('*/', pos + 2);
      const commentEnd = end === -1 ? code.length : end + 2;
      tokens.push({ type: 'comment', text: code.slice(pos, commentEnd) });
      pos = commentEnd;
      codeStart = pos;
      continue;
    }

    // String literals: ', ", `
    if (ch === "'" || ch === '"' || ch === '`') {
      if (pos > codeStart) {
        tokens.push({ type: 'code', text: code.slice(codeStart, pos) });
      }
      const quote = ch;
      let strPos = pos + 1;
      while (strPos < code.length) {
        if (code[strPos] === '\\') {
          strPos += 2;
          continue;
        }
        if (code[strPos] === quote) {
          strPos++;
          break;
        }
        strPos++;
      }
      tokens.push({ type: 'string', text: code.slice(pos, strPos) });
      pos = strPos;
      codeStart = pos;
      continue;
    }

    pos++;
  }

  if (pos > codeStart) {
    tokens.push({ type: 'code', text: code.slice(codeStart, pos) });
  }

  return tokens;
}

/**
 * Inlines local ES module specifiers recursively with cycle detection,
 * memoization, and bounded depth.
 */
function processModuleFile(
  modulePath: string,
  fileMap: Map<string, BundleFile>,
  warnings: PipelineWarning[],
  visitedModules: Set<string> = new Set(),
  memoizedModules: Map<string, string> = new Map(),
  depth = 0,
): string {
  if (visitedModules.has(modulePath)) {
    warnings.push({
      code: 'CYCLE_DETECTED',
      message: `Modül içe aktarma döngüsü tespit edildi: ${modulePath}`,
      target: modulePath,
    });
    return `/* Cycle detected: ${modulePath} */\nexport {};\n`;
  }

  if (memoizedModules.has(modulePath)) {
    return memoizedModules.get(modulePath)!;
  }

  const file = fileMap.get(modulePath);
  if (!file) {
    warnings.push({
      code: 'MISSING_RESOURCE',
      message: `Pakette bulunamayan yerel modül dosyası: ${modulePath}`,
      target: modulePath,
    });
    return `/* Missing module: ${modulePath} */\nexport {};\n`;
  }

  const nextVisited = new Set(visitedModules);
  nextVisited.add(modulePath);

  const rawCode = new TextDecoder('utf-8').decode(file.data);
  const dir = getDirectoryName(modulePath);
  const processed = processModuleCode(
    rawCode,
    dir,
    fileMap,
    warnings,
    nextVisited,
    memoizedModules,
    depth,
  );
  memoizedModules.set(modulePath, processed);
  return processed;
}

/**
 * Processes module code, converting relative import specifiers into data URIs.
 * Uses lexical tokenization to protect string literals and comments from being rewritten.
 */
function processModuleCode(
  code: string,
  containingDir: string,
  fileMap: Map<string, BundleFile>,
  warnings: PipelineWarning[],
  visitedModules: Set<string> = new Set(),
  memoizedModules: Map<string, string> = new Map(),
  depth = 0,
): string {
  if (depth > 15) {
    warnings.push({
      code: 'UNSUPPORTED_CONSTRUCT',
      message: 'Modül içe aktarma derinlik sınırı aşıldı (azami 15 düzey).',
      target: containingDir,
    });
    return code;
  }

  const tokens = tokenizeJs(code);
  let out = '';

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'comment') {
      out += token.text;
      continue;
    }

    if (token.type === 'string') {
      let prevCode = '';
      for (let j = i - 1; j >= 0; j--) {
        if (tokens[j].type === 'code') {
          prevCode = tokens[j].text;
          break;
        }
      }

      // Check if prevCode ends with import / from / import(
      const isImportSpecifier =
        /(?:(?:import|export)\s+(?:[\w*\s{},]*\s+from\s*|)|import\s*\(\s*)$/.test(prevCode);

      if (isImportSpecifier) {
        const quote = token.text[0];
        const rawSpecifier = token.text.slice(1, -1);
        const trimmedSpecifier = decodeHtmlEntities(rawSpecifier).trim();
        const category = classifyUrl(trimmedSpecifier);

        if (category === 'data-uri' || category === 'blob-uri') {
          out += token.text;
          continue;
        }

        if (category === 'external-https' || category === 'external-protocol-relative') {
          warnings.push({
            code: 'EXTERNAL_RESOURCE',
            message: `Modül scripti içinde harici import: ${trimmedSpecifier}`,
            target: trimmedSpecifier,
          });
          out += token.text;
          continue;
        }

        if (category === 'external-http') {
          warnings.push({
            code: 'INSECURE_RESOURCE',
            message: `Modül scripti içinde güvensiz HTTP import: ${trimmedSpecifier}`,
            target: trimmedSpecifier,
          });
          out += token.text;
          continue;
        }

        const { cleanPath } = stripQueryAndHash(trimmedSpecifier);
        const resolvedPath = resolveRelativePath(containingDir, cleanPath);

        if (resolvedPath && fileMap.has(resolvedPath)) {
          let inlinedNested = memoizedModules.get(resolvedPath);
          if (inlinedNested === undefined) {
            inlinedNested = processModuleFile(
              resolvedPath,
              fileMap,
              warnings,
              visitedModules,
              memoizedModules,
              depth + 1,
            );
            memoizedModules.set(resolvedPath, inlinedNested);
          }
          const dataUri = toDataUri(
            new TextEncoder().encode(inlinedNested),
            'text/javascript',
          );
          out += `${quote}${dataUri}${quote}`;
          continue;
        }

        warnings.push({
          code: 'MISSING_RESOURCE',
          message: `Modül scripti içinde bulunamayan yerel dosya: ${trimmedSpecifier}`,
          target: trimmedSpecifier,
        });
        const emptyModuleUri = 'data:text/javascript,export%20default%20%7B%7D%3B';
        out += `${quote}${emptyModuleUri}${quote}`;
        continue;
      }

      out += token.text;
      continue;
    }

    out += token.text;
  }

  return out;
}

/**
 * Locates the optimal entry HTML document in a bundle.
 */
export function findHtmlEntry(
  files: BundleFile[],
  explicitSelection?: string,
): Result<BundleFile> {
  const htmlFiles = files.filter(
    (f) => f.path.toLowerCase().endsWith('.html') || f.path.toLowerCase().endsWith('.htm'),
  );

  if (htmlFiles.length === 0) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Paket içinde HTML giriş dosyası bulunamadı.',
    });
  }

  if (explicitSelection) {
    const normSelection = normalizePath(explicitSelection);
    const found = htmlFiles.find(
      (f) =>
        f.path === normSelection ||
        f.path.toLowerCase() === normSelection.toLowerCase() ||
        f.name === explicitSelection,
    );
    if (found) {
      return ok(found);
    }
  }

  const rootIndex = htmlFiles.find((f) => f.path.toLowerCase() === 'index.html');
  if (rootIndex) {
    return ok(rootIndex);
  }

  const anyIndex = htmlFiles.find((f) => f.name?.toLowerCase() === 'index.html');
  if (anyIndex) {
    return ok(anyIndex);
  }

  const sorted = [...htmlFiles].sort((a, b) => a.path.localeCompare(b.path));
  return ok(sorted[0]);
}

/**
 * Bundles an HTML presentation into a single self-contained document.
 * Safely partitions comments, script tags, style tags, and general markup,
 * preventing markup rewriting inside JavaScript string literals or comments.
 */
export function bundlePresentation(
  files: BundleFile[],
  options?: { explicitEntry?: string; titleOverride?: string },
): Result<BundledHtmlResult> {
  const entryResult = findHtmlEntry(files, options?.explicitEntry);
  if (!entryResult.ok) {
    return entryResult;
  }

  const entryFile = entryResult.value;
  const warnings: PipelineWarning[] = [];
  const fileMap = new Map<string, BundleFile>();

  for (const f of files) {
    fileMap.set(f.path, f);
  }

  const entryDir = getDirectoryName(entryFile.path);
  const rawHtml = new TextDecoder('utf-8').decode(entryFile.data);

  // Extract presentation title
  let title = options?.titleOverride?.trim() || '';
  if (!title) {
    const titleMatch = rawHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = decodeHtmlEntities(titleMatch[1]).trim();
    }
  }
  if (!title) {
    title = titleFromFileName(entryFile.name || entryFile.path);
  }
  if (title.length > MAX_TITLE_LENGTH) {
    title = title.slice(0, MAX_TITLE_LENGTH);
  }

  // Tokenize and transform HTML
  let pos = 0;
  const outputChunks: string[] = [];
  let currentUnpackedBytes = 0;

  const appendOutput = (str: string): boolean => {
    const chunkBytes = new TextEncoder().encode(str).length;
    currentUnpackedBytes += chunkBytes;
    if (currentUnpackedBytes > MAX_HTML_UNPACKED_BYTES) {
      return false;
    }
    outputChunks.push(str);
    return true;
  };

  while (pos < rawHtml.length) {
    // 1. HTML Comments: <!-- ... --> (preserve verbatim)
    if (rawHtml.startsWith('<!--', pos)) {
      const end = rawHtml.indexOf('-->', pos + 4);
      const commentEnd = end === -1 ? rawHtml.length : end + 3;
      const commentStr = rawHtml.slice(pos, commentEnd);
      if (!appendOutput(commentStr)) {
        return err({
          code: AppErrorCode.FILE_TOO_LARGE,
          message: 'Paketlenen HTML boyutu açılmış sınırını aşıyor (maksimum 25 MB).',
        });
      }
      pos = commentEnd;
      continue;
    }

    // 2. <script> tags: <script ...>...</script>
    if (rawHtml.slice(pos, pos + 7).toLowerCase() === '<script') {
      const openTagEnd = findTagEnd(rawHtml, pos);
      if (openTagEnd === -1) {
        // Unterminated tag, append remainder
        appendOutput(rawHtml.slice(pos));
        break;
      }
      const openTag = rawHtml.slice(pos, openTagEnd + 1);
      const closeIdx = rawHtml.toLowerCase().indexOf('</script>', openTagEnd + 1);
      const scriptEnd = closeIdx === -1 ? rawHtml.length : closeIdx + 9;
      const inlineBody = rawHtml.slice(openTagEnd + 1, closeIdx === -1 ? rawHtml.length : closeIdx);

      pos = scriptEnd;

      const srcVal = getAttributeValue(openTag, 'src');
      if (srcVal !== null) {
        const decodedSrc = decodeHtmlEntities(srcVal).trim();
        const category = classifyUrl(decodedSrc);

        if (category === 'data-uri' || category === 'blob-uri') {
          // Strictly preserve existing data-URI scripts!
          if (!appendOutput(`${openTag}${inlineBody}</script>`)) {
            return err({
              code: AppErrorCode.FILE_TOO_LARGE,
              message: 'Paketlenen HTML boyutu açılmış sınırını aşıyor (maksimum 25 MB).',
            });
          }
          continue;
        }

        if (category === 'external-https' || category === 'external-protocol-relative') {
          warnings.push({
            code: 'EXTERNAL_RESOURCE',
            message: `Harici HTTPS script bağlantısı korundu: ${decodedSrc}`,
            target: decodedSrc,
          });
          if (!appendOutput(`${openTag}${inlineBody}</script>`)) {
            return err({
              code: AppErrorCode.FILE_TOO_LARGE,
              message: 'Paketlenen HTML boyutu açılmış sınırını aşıyor (maksimum 25 MB).',
            });
          }
          continue;
        }

        if (category === 'external-http') {
          warnings.push({
            code: 'INSECURE_RESOURCE',
            message: `Güvensiz harici HTTP script bağlantısı: ${decodedSrc}`,
            target: decodedSrc,
          });
          if (!appendOutput(`${openTag}${inlineBody}</script>`)) {
            return err({
              code: AppErrorCode.FILE_TOO_LARGE,
              message: 'Paketlenen HTML boyutu açılmış sınırını aşıyor (maksimum 25 MB).',
            });
          }
          continue;
        }

        // Local script
        const { cleanPath } = stripQueryAndHash(decodedSrc);
        const resolvedPath = resolveRelativePath(entryDir, cleanPath);
        const scriptFile = fileMap.get(resolvedPath);

        if (!scriptFile) {
          warnings.push({
            code: 'MISSING_RESOURCE',
            message: `Pakette bulunamayan yerel script dosyası: ${decodedSrc}`,
            target: decodedSrc,
          });
          if (!appendOutput(`<!-- Missing script: ${decodedSrc} -->`)) {
            return err({
              code: AppErrorCode.FILE_TOO_LARGE,
              message: 'Paketlenen HTML boyutu açılmış sınırını aşıyor (maksimum 25 MB).',
            });
          }
          continue;
        }

        let scriptCode = new TextDecoder('utf-8').decode(scriptFile.data);
        const typeVal = getAttributeValue(openTag, 'type') || '';
        if (typeVal.toLowerCase() === 'module') {
          const scriptDir = getDirectoryName(resolvedPath);
          scriptCode = processModuleCode(scriptCode, scriptDir, fileMap, warnings);
        }

        const safeCode = scriptCode.replace(/<\/script>/gi, '<\\/script>');
        // Strip src attribute and add data-inlined-from
        const cleanedOpenTag = openTag
          .replace(/\bsrc\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/i, '')
          .replace(/>$/, ` data-inlined-from="${decodedSrc}">`);

        if (!appendOutput(`${cleanedOpenTag}\n${safeCode}\n</script>`)) {
          return err({
            code: AppErrorCode.FILE_TOO_LARGE,
            message: 'Paketlenen HTML boyutu açılmış sınırını aşıyor (maksimum 25 MB).',
          });
        }
        continue;
      }

      // Inline script without src
      const typeVal = getAttributeValue(openTag, 'type') || '';
      let processedBody = inlineBody;
      if (typeVal.toLowerCase() === 'module') {
        processedBody = processModuleCode(inlineBody, entryDir, fileMap, warnings);
      }

      // Preserve body verbatim (do NOT modify JavaScript string literals or comments!)
      if (!appendOutput(`${openTag}${processedBody}</script>`)) {
        return err({
          code: AppErrorCode.FILE_TOO_LARGE,
          message: 'Paketlenen HTML boyutu açılmış sınırını aşıyor (maksimum 25 MB).',
        });
      }
      continue;
    }

    // 3. <style> tags: <style ...>...</style>
    if (rawHtml.slice(pos, pos + 6).toLowerCase() === '<style') {
      const openTagEnd = findTagEnd(rawHtml, pos);
      if (openTagEnd === -1) {
        appendOutput(rawHtml.slice(pos));
        break;
      }
      const openTag = rawHtml.slice(pos, openTagEnd + 1);
      const closeIdx = rawHtml.toLowerCase().indexOf('</style>', openTagEnd + 1);
      const styleEnd = closeIdx === -1 ? rawHtml.length : closeIdx + 8;
      const cssBody = rawHtml.slice(openTagEnd + 1, closeIdx === -1 ? rawHtml.length : closeIdx);

      pos = styleEnd;

      const processedCss = processCssContent(cssBody, entryDir, fileMap, warnings);
      if (!appendOutput(`${openTag}\n${processedCss}\n</style>`)) {
        return err({
          code: AppErrorCode.FILE_TOO_LARGE,
          message: 'Paketlenen HTML boyutu açılmış sınırını aşıyor (maksimum 25 MB).',
        });
      }
      continue;
    }

    // 4. Other HTML tags: <tag ...>
    if (rawHtml[pos] === '<') {
      const tagEnd = findTagEnd(rawHtml, pos);
      if (tagEnd === -1) {
        appendOutput(rawHtml.slice(pos));
        break;
      }

      let tagStr = rawHtml.slice(pos, tagEnd + 1);
      pos = tagEnd + 1;

      const tagMatch = tagStr.match(/^<([a-zA-Z0-9:-]+)/);
      if (!tagMatch) {
        appendOutput(tagStr);
        continue;
      }

      const tagName = tagMatch[1].toLowerCase();

      if (tagName === 'base') {
        const hrefVal = getAttributeValue(tagStr, 'href') || '';
        warnings.push({
          code: 'NORMALIZATION_NOTE',
          message: '<base> etiketi yerel veri URI çözümlemesini korumak için nötralize edildi.',
          details: tagStr,
        });
        appendOutput(`<!-- Base tag neutralized: href="${hrefVal}" -->`);
        continue;
      }

      // <link ...>: Stylesheets, icons
      if (tagName === 'link') {
        const relVal = (getAttributeValue(tagStr, 'rel') || '').toLowerCase();
        const relTokens = relVal.split(/\s+/);

        if (relTokens.includes('stylesheet')) {
          const hrefVal = getAttributeValue(tagStr, 'href');
          if (!hrefVal) {
            appendOutput(tagStr);
            continue;
          }

          const decodedHref = decodeHtmlEntities(hrefVal).trim();
          const category = classifyUrl(decodedHref);

          if (category === 'data-uri') {
            appendOutput(tagStr);
            continue;
          }

          if (category === 'external-https' || category === 'external-protocol-relative') {
            warnings.push({
              code: 'EXTERNAL_RESOURCE',
              message: `Harici HTTPS stil dosyası bağlantısı korundu: ${decodedHref}`,
              target: decodedHref,
            });
            appendOutput(tagStr);
            continue;
          }

          if (category === 'external-http') {
            warnings.push({
              code: 'INSECURE_RESOURCE',
              message: `Güvensiz harici HTTP stil dosyası bağlantısı: ${decodedHref}`,
              target: decodedHref,
            });
            appendOutput(tagStr);
            continue;
          }

          // Local stylesheet
          const { cleanPath } = stripQueryAndHash(decodedHref);
          const resolvedPath = resolveRelativePath(entryDir, cleanPath);
          const cssFile = fileMap.get(resolvedPath);

          if (cssFile) {
            const cssDir = getDirectoryName(resolvedPath);
            const cssText = new TextDecoder('utf-8').decode(cssFile.data);
            let processedCss = processCssContent(cssText, cssDir, fileMap, warnings);

            const mediaVal = getAttributeValue(tagStr, 'media');
            if (mediaVal && mediaVal.trim()) {
              processedCss = `@media ${mediaVal.trim()} {\n${processedCss}\n}`;
            }

            appendOutput(
              `<style data-inlined-from="${decodedHref}">\n${processedCss}\n</style>`,
            );
            continue;
          }

          warnings.push({
            code: 'MISSING_RESOURCE',
            message: `Pakette bulunamayan stil dosyası: ${decodedHref}`,
            target: decodedHref,
          });
          appendOutput(`<!-- Missing stylesheet: ${decodedHref} -->`);
          continue;
        }

        // Icon links
        if (relTokens.includes('icon') || relTokens.includes('apple-touch-icon')) {
          const hrefVal = getAttributeValue(tagStr, 'href');
          if (hrefVal) {
            const decodedHref = decodeHtmlEntities(hrefVal).trim();
            if (classifyUrl(decodedHref) === 'relative') {
              const { cleanPath } = stripQueryAndHash(decodedHref);
              const resolvedPath = resolveRelativePath(entryDir, cleanPath);
              const iconFile = fileMap.get(resolvedPath);
              if (iconFile) {
                const mime = getMimeType(resolvedPath);
                const dataUri = toDataUri(iconFile.data, mime);
                tagStr = replaceAttribute(tagStr, 'href', dataUri);
              } else {
                warnings.push({
                  code: 'MISSING_RESOURCE',
                  message: `Pakette bulunamayan ikon dosyası: ${decodedHref}`,
                  target: decodedHref,
                });
                tagStr = replaceAttribute(tagStr, 'href', TRANSPARENT_1X1_GIF);
              }
            }
          }
        }
      }

      // <img> and <source> tags: src and srcset
      if (tagName === 'img' || tagName === 'source') {
        const srcsetVal = getAttributeValue(tagStr, 'srcset');
        if (srcsetVal !== null) {
          const inlinedSrcset = processSrcset(srcsetVal, entryDir, fileMap, warnings);
          tagStr = replaceAttribute(tagStr, 'srcset', inlinedSrcset);
        }

        const srcVal = getAttributeValue(tagStr, 'src');
        if (srcVal !== null) {
          const decodedSrc = decodeHtmlEntities(srcVal).trim();
          const category = classifyUrl(decodedSrc);

          if (category === 'relative') {
            const { cleanPath, hash } = stripQueryAndHash(decodedSrc);
            const resolvedPath = resolveRelativePath(entryDir, cleanPath);
            const imgFile = fileMap.get(resolvedPath);

            if (imgFile) {
              const mime = getMimeType(resolvedPath);
              const dataUri = toDataUri(imgFile.data, mime) + (hash || '');
              tagStr = replaceAttribute(tagStr, 'src', dataUri);
            } else {
              warnings.push({
                code: 'MISSING_RESOURCE',
                message: `Pakette bulunamayan görsel kaynağı: ${decodedSrc}`,
                target: decodedSrc,
              });
              tagStr = replaceAttribute(tagStr, 'src', TRANSPARENT_1X1_GIF);
            }
          } else if (category === 'external-https' || category === 'external-protocol-relative') {
            warnings.push({
              code: 'EXTERNAL_RESOURCE',
              message: `Harici görsel kaynağı korundu: ${decodedSrc}`,
              target: decodedSrc,
            });
          } else if (category === 'external-http') {
            warnings.push({
              code: 'INSECURE_RESOURCE',
              message: `Güvensiz HTTP görsel kaynağı: ${decodedSrc}`,
              target: decodedSrc,
            });
          }
        }
      }

      // SVG <use> and <image> elements
      if (tagName === 'use' || tagName === 'image') {
        const hrefVal = getAttributeValue(tagStr, 'href') || getAttributeValue(tagStr, 'xlink:href');
        if (hrefVal !== null) {
          const decodedHref = decodeHtmlEntities(hrefVal).trim();
          const category = classifyUrl(decodedHref);

          if (category === 'relative') {
            const { cleanPath, hash } = stripQueryAndHash(decodedHref);
            if (cleanPath) {
              const resolvedPath = resolveRelativePath(entryDir, cleanPath);
              const assetFile = fileMap.get(resolvedPath);

              if (assetFile) {
                const mime = getMimeType(resolvedPath);
                const dataUri = toDataUri(assetFile.data, mime) + (hash || '');
                const attrToReplace = getAttributeValue(tagStr, 'href') !== null ? 'href' : 'xlink:href';
                tagStr = replaceAttribute(tagStr, attrToReplace, dataUri);
              } else {
                warnings.push({
                  code: 'MISSING_RESOURCE',
                  message: `SVG içinde bulunamayan yerel kaynak: ${decodedHref}`,
                  target: decodedHref,
                });
                const attrToReplace = getAttributeValue(tagStr, 'href') !== null ? 'href' : 'xlink:href';
                tagStr = replaceAttribute(tagStr, attrToReplace, TRANSPARENT_1X1_GIF);
              }
            }
          } else if (category === 'external-https' || category === 'external-protocol-relative') {
            warnings.push({
              code: 'EXTERNAL_RESOURCE',
              message: `SVG içinde harici kaynak bağlantısı: ${decodedHref}`,
              target: decodedHref,
            });
          }
        }
      }

      // Inline style="..." attribute on any HTML element
      const styleVal = getAttributeValue(tagStr, 'style');
      if (styleVal !== null && styleVal.includes('url(')) {
        const processedStyle = processCssContent(styleVal, entryDir, fileMap, warnings);
        tagStr = replaceAttribute(tagStr, 'style', processedStyle);
      }

      if (!appendOutput(tagStr)) {
        return err({
          code: AppErrorCode.FILE_TOO_LARGE,
          message: 'Paketlenen HTML boyutu açılmış sınırını aşıyor (maksimum 25 MB).',
        });
      }
      continue;
    }

    // 5. Plain text chunk
    let nextTag = rawHtml.indexOf('<', pos);
    if (nextTag === -1) nextTag = rawHtml.length;
    const textChunk = rawHtml.slice(pos, nextTag);
    if (!appendOutput(textChunk)) {
      return err({
        code: AppErrorCode.FILE_TOO_LARGE,
        message: 'Paketlenen HTML boyutu açılmış sınırını aşıyor (maksimum 25 MB).',
      });
    }
    pos = nextTag;
  }

  const finalHtml = outputChunks.join('');
  const finalBytes = new TextEncoder().encode(finalHtml);

  if (finalBytes.length > MAX_HTML_UNPACKED_BYTES) {
    return err({
      code: AppErrorCode.FILE_TOO_LARGE,
      message: `Paketlenen HTML boyutu açılmış sınırını aşıyor (maksimum 25 MB). Mevcut: ${finalBytes.length} bayt.`,
    });
  }

  return ok({
    html: finalHtml,
    entryPath: entryFile.path,
    title,
    warnings,
    unpackedBytes: finalBytes.length,
  });
}
