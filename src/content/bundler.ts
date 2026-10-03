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
 * Decodes HTML entities commonly found in titles and attributes.
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
 * Parses srcset attribute and inlines local URLs to data URIs.
 */
function processSrcset(
  srcset: string,
  containingDir: string,
  fileMap: Map<string, BundleFile>,
  warnings: PipelineWarning[],
): string {
  const candidates = srcset.split(',');
  const processedCandidates: string[] = [];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    const url = parts[0];
    const descriptor = parts.slice(1).join(' ');

    const category = classifyUrl(url);
    if (category === 'data-uri' || category === 'fragment-only') {
      processedCandidates.push(trimmed);
      continue;
    }

    if (category === 'external-https' || category === 'external-protocol-relative') {
      warnings.push({
        code: 'EXTERNAL_RESOURCE',
        message: `Çözümlenmemiş harici srcset kaynağı: ${url}`,
        target: url,
      });
      processedCandidates.push(trimmed);
      continue;
    }

    if (category === 'external-http') {
      warnings.push({
        code: 'INSECURE_RESOURCE',
        message: `Güvensiz harici HTTP srcset kaynağı: ${url}`,
        target: url,
      });
      processedCandidates.push(trimmed);
      continue;
    }

    // Local relative file
    const resolvedPath = resolveRelativePath(containingDir, url);
    const targetFile = fileMap.get(resolvedPath);

    if (targetFile) {
      const mime = getMimeType(resolvedPath);
      const dataUri = toDataUri(targetFile.data, mime);
      processedCandidates.push(descriptor ? `${dataUri} ${descriptor}` : dataUri);
    } else {
      warnings.push({
        code: 'MISSING_RESOURCE',
        message: `Pakette bulunamayan yerel srcset kaynağı: ${url}`,
        target: url,
      });
      processedCandidates.push(descriptor ? `${TRANSPARENT_1X1_GIF} ${descriptor}` : TRANSPARENT_1X1_GIF);
    }
  }

  return processedCandidates.join(', ');
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
): string {
  // Regex matching comments, strings, @import rules, and url() expressions in order
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
      // 1. Comments: preserve as-is
      if (match.startsWith('/*')) {
        return match;
      }

      // 2. Quoted string literals: preserve as-is
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

        const nestedDir = getDirectoryName(cleanPath);
        const nestedText = new TextDecoder('utf-8').decode(nestedFile.data);
        const processedNested = processCssContent(
          nestedText,
          nestedDir,
          fileMap,
          warnings,
          nextVisited,
        );

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
        // Inert placeholder prevents any parent-origin leaks
        return `url("${TRANSPARENT_1X1_GIF}")`;
      }

      return match;
    },
  );

  return result;
}

/**
 * Inlines local ES module import specifiers within inline module scripts.
 */
function processModuleScript(
  scriptContent: string,
  containingDir: string,
  fileMap: Map<string, BundleFile>,
  warnings: PipelineWarning[],
): string {
  // Regex matching `import ... from '...'` or `export ... from '...'`
  const MODULE_IMPORT_REGEX =
    /((?:import|export)\s+(?:[\w*\s{},]*\s+from\s+)?)(['"])(.*?)\2/g;

  return scriptContent.replace(MODULE_IMPORT_REGEX, (match, prefix, quote, specifier) => {
    const trimmedSpecifier = specifier.trim();
    const category = classifyUrl(trimmedSpecifier);

    if (category === 'data-uri' || category === 'blob-uri') {
      return match;
    }

    if (category === 'external-https' || category === 'external-protocol-relative') {
      warnings.push({
        code: 'EXTERNAL_RESOURCE',
        message: `Modül scripti içinde harici import: ${trimmedSpecifier}`,
        target: trimmedSpecifier,
      });
      return match;
    }

    if (category === 'external-http') {
      warnings.push({
        code: 'INSECURE_RESOURCE',
        message: `Modül scripti içinde güvensiz HTTP import: ${trimmedSpecifier}`,
        target: trimmedSpecifier,
      });
      return match;
    }

    // Relative module import (e.g. './util.js', '../core/math.mjs')
    if (trimmedSpecifier.startsWith('.') || trimmedSpecifier.startsWith('/')) {
      const resolvedPath = resolveRelativePath(containingDir, trimmedSpecifier);
      const importedFile = fileMap.get(resolvedPath);

      if (importedFile) {
        const mime = getMimeType(resolvedPath);
        const dataUri = toDataUri(importedFile.data, mime);
        return `${prefix}${quote}${dataUri}${quote}`;
      }

      warnings.push({
        code: 'MISSING_RESOURCE',
        message: `Modül scripti içinde bulunamayan yerel dosya: ${trimmedSpecifier}`,
        target: trimmedSpecifier,
      });
    }

    return match;
  });
}

/**
 * Locates the optimal entry HTML document in a bundle.
 * Prefers index.html (or case-insensitive index.html), else deterministic first HTML.
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

  // 1. Explicit user selection
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

  // 2. Exact 'index.html' at root level
  const rootIndex = htmlFiles.find((f) => f.path.toLowerCase() === 'index.html');
  if (rootIndex) {
    return ok(rootIndex);
  }

  // 3. Any 'index.html' in nested folders
  const anyIndex = htmlFiles.find((f) => f.name?.toLowerCase() === 'index.html');
  if (anyIndex) {
    return ok(anyIndex);
  }

  // 4. Deterministic first HTML file sorted alphabetically by normalized path
  const sorted = [...htmlFiles].sort((a, b) => a.path.localeCompare(b.path));
  return ok(sorted[0]);
}

/**
 * Bundles an HTML presentation into a single self-contained document.
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
  let html = new TextDecoder('utf-8').decode(entryFile.data);

  // Extract or derive presentation title
  let title = options?.titleOverride?.trim() || '';
  if (!title) {
    const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
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

  // Neutralize <base href="..."> if present to prevent data URI and relative hash hijacking
  html = html.replace(/<base\b([^>]*)>/gi, (match, attrs) => {
    warnings.push({
      code: 'NORMALIZATION_NOTE',
      message: '<base> etiketi yerel veri URI çözümlemesini korumak için nötralize edildi.',
      details: match,
    });
    return `<!-- Base tag neutralized: ${attrs} -->`;
  });

  // 1. Process <link rel="stylesheet"> tags
  const LINK_TAG_REGEX = /<link\b([^>]*?)>/gi;
  html = html.replace(LINK_TAG_REGEX, (match, attrs) => {
    const relMatch = attrs.match(/\brel\s*=\s*(['"]?)(.*?)\1(?:\s|$)/i);
    const relValue = relMatch ? relMatch[2].toLowerCase() : '';

    if (relValue.split(/\s+/).includes('stylesheet')) {
      const hrefMatch = attrs.match(/\bhref\s*=\s*(['"]?)(.*?)\1(?:\s|$)/i);
      const href = hrefMatch ? hrefMatch[2].trim() : '';

      if (!href) {
        return match;
      }

      const category = classifyUrl(href);
      if (category === 'external-https' || category === 'external-protocol-relative') {
        warnings.push({
          code: 'EXTERNAL_RESOURCE',
          message: `Harici HTTPS stil dosyası bağlantısı korundu: ${href}`,
          target: href,
        });
        return match;
      }

      if (category === 'external-http') {
        warnings.push({
          code: 'INSECURE_RESOURCE',
          message: `Güvensiz harici HTTP stil dosyası bağlantısı: ${href}`,
          target: href,
        });
        return match;
      }

      // Local stylesheet
      const { cleanPath } = stripQueryAndHash(href);
      const resolvedPath = resolveRelativePath(entryDir, cleanPath);
      const cssFile = fileMap.get(resolvedPath);

      if (cssFile) {
        const cssDir = getDirectoryName(resolvedPath);
        const cssText = new TextDecoder('utf-8').decode(cssFile.data);
        const processedCss = processCssContent(cssText, cssDir, fileMap, warnings);
        return `<style data-inlined-from="${href}">\n${processedCss}\n</style>`;
      }

      warnings.push({
        code: 'MISSING_RESOURCE',
        message: `Pakette bulunamayan stil dosyası: ${href}`,
        target: href,
      });
      return `<!-- Missing stylesheet: ${href} -->`;
    }

    // Inlined icon links
    if (relValue.includes('icon') || relValue.includes('apple-touch-icon')) {
      const hrefMatch = attrs.match(/\bhref\s*=\s*(['"]?)(.*?)\1(?:\s|$)/i);
      const href = hrefMatch ? hrefMatch[2].trim() : '';
      if (href && classifyUrl(href) === 'relative') {
        const resolvedPath = resolveRelativePath(entryDir, href);
        const iconFile = fileMap.get(resolvedPath);
        if (iconFile) {
          const mime = getMimeType(resolvedPath);
          const dataUri = toDataUri(iconFile.data, mime);
          return match.replace(href, dataUri);
        }
      }
    }

    return match;
  });

  // 2. Process inline <style> tags
  const STYLE_TAG_REGEX = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;
  html = html.replace(STYLE_TAG_REGEX, (_, openTag, cssContent, closeTag) => {
    const processed = processCssContent(cssContent, entryDir, fileMap, warnings);
    return `${openTag}${processed}${closeTag}`;
  });

  // 3. Process <script ... src="..."> tags
  const SCRIPT_TAG_REGEX = /<script\b([^>]*?)>([\s\S]*?)<\/script>/gi;
  html = html.replace(SCRIPT_TAG_REGEX, (match, attrs, inlineBody) => {
    const srcMatch = attrs.match(/\bsrc\s*=\s*(['"]?)(.*?)\1(?:\s|$)/i);
    if (!srcMatch || !srcMatch[2]) {
      // Inline script without src
      const typeMatch = attrs.match(/\btype\s*=\s*(['"]?)(.*?)\1(?:\s|$)/i);
      const isModule = typeMatch && typeMatch[2].toLowerCase() === 'module';

      if (isModule && inlineBody) {
        const processed = processModuleScript(inlineBody, entryDir, fileMap, warnings);
        return match.replace(inlineBody, processed);
      }
      return match;
    }

    const src = srcMatch[2].trim();
    const category = classifyUrl(src);

    if (category === 'external-https' || category === 'external-protocol-relative') {
      warnings.push({
        code: 'EXTERNAL_RESOURCE',
        message: `Harici HTTPS script bağlantısı korundu: ${src}`,
        target: src,
      });
      return match;
    }

    if (category === 'external-http') {
      warnings.push({
        code: 'INSECURE_RESOURCE',
        message: `Güvensiz harici HTTP script bağlantısı: ${src}`,
        target: src,
      });
      return match;
    }

    // Local script
    const { cleanPath } = stripQueryAndHash(src);
    const resolvedPath = resolveRelativePath(entryDir, cleanPath);
    const scriptFile = fileMap.get(resolvedPath);

    if (!scriptFile) {
      warnings.push({
        code: 'MISSING_RESOURCE',
        message: `Pakette bulunamayan yerel script dosyası: ${src}`,
        target: src,
      });
      return `<!-- Missing script: ${src} -->`;
    }

    const scriptDir = getDirectoryName(resolvedPath);
    let scriptCode = new TextDecoder('utf-8').decode(scriptFile.data);

    const typeMatch = attrs.match(/\btype\s*=\s*(['"]?)(.*?)\1(?:\s|$)/i);
    const isModule = typeMatch && typeMatch[2].toLowerCase() === 'module';

    if (isModule) {
      scriptCode = processModuleScript(scriptCode, scriptDir, fileMap, warnings);
    }

    // Strip `src="..."` from attributes and escape any `</script>` in the code
    const cleanedAttrs = attrs.replace(/\bsrc\s*=\s*(['"]?).*?\1(?:\s|$)/i, ' ').trim();
    const safeCode = scriptCode.replace(/<\/script>/gi, '<\\/script>');
    const attrsStr = cleanedAttrs ? ` ${cleanedAttrs}` : '';

    return `<script${attrsStr} data-inlined-from="${src}">\n${safeCode}\n</script>`;
  });

  // 4. Process <img> and <source> tags (src and srcset)
  const MEDIA_TAG_REGEX = /<(img|source)\b([^>]*?)>/gi;
  html = html.replace(MEDIA_TAG_REGEX, (_match, tagName, attrs) => {
    let modifiedAttrs = attrs;

    // Process srcset first
    const srcsetMatch = attrs.match(/\bsrcset\s*=\s*(['"])([\s\S]*?)\1/i);
    if (srcsetMatch) {
      const quote = srcsetMatch[1];
      const rawSrcset = srcsetMatch[2];
      const inlinedSrcset = processSrcset(rawSrcset, entryDir, fileMap, warnings);
      modifiedAttrs = modifiedAttrs.replace(
        srcsetMatch[0],
        `srcset=${quote}${inlinedSrcset}${quote}`,
      );
    }

    // Process src attribute
    const srcMatch = modifiedAttrs.match(/\bsrc\s*=\s*(['"]?)(.*?)\1(?:\s|$|>)/i);
    if (srcMatch && srcMatch[2]) {
      const src = srcMatch[2].trim();
      const category = classifyUrl(src);

      if (category === 'relative') {
        const { cleanPath, hash } = stripQueryAndHash(src);
        const resolvedPath = resolveRelativePath(entryDir, cleanPath);
        const imgFile = fileMap.get(resolvedPath);

        if (imgFile) {
          const mime = getMimeType(resolvedPath);
          const dataUri = toDataUri(imgFile.data, mime) + (hash || '');
          const quote = srcMatch[1] || '"';
          modifiedAttrs = modifiedAttrs.replace(
            srcMatch[0],
            `src=${quote}${dataUri}${quote} `,
          );
        } else {
          warnings.push({
            code: 'MISSING_RESOURCE',
            message: `Pakette bulunamayan görsel kaynağı: ${src}`,
            target: src,
          });
          const quote = srcMatch[1] || '"';
          modifiedAttrs = modifiedAttrs.replace(
            srcMatch[0],
            `src=${quote}${TRANSPARENT_1X1_GIF}${quote} `,
          );
        }
      } else if (category === 'external-https' || category === 'external-protocol-relative') {
        warnings.push({
          code: 'EXTERNAL_RESOURCE',
          message: `Harici görsel kaynağı korundu: ${src}`,
          target: src,
        });
      } else if (category === 'external-http') {
        warnings.push({
          code: 'INSECURE_RESOURCE',
          message: `Güvensiz HTTP görsel kaynağı: ${src}`,
          target: src,
        });
      }
    }

    return `<${tagName} ${modifiedAttrs.trim()}>`;
  });

  // 5. Process SVG <use> and <image> references
  const SVG_USE_REGEX = /<(use|image)\b([^>]*?)>/gi;
  html = html.replace(SVG_USE_REGEX, (match, _tagName, attrs) => {
    const hrefMatch =
      attrs.match(/\bhref\s*=\s*(['"]?)(.*?)\1(?:\s|$|>)/i) ||
      attrs.match(/\bxlink:href\s*=\s*(['"]?)(.*?)\1(?:\s|$|>)/i);

    if (!hrefMatch || !hrefMatch[2]) {
      return match;
    }

    const href = hrefMatch[2].trim();
    const category = classifyUrl(href);

    if (category === 'relative') {
      const { cleanPath, hash } = stripQueryAndHash(href);
      if (cleanPath) {
        const resolvedPath = resolveRelativePath(entryDir, cleanPath);
        const assetFile = fileMap.get(resolvedPath);

        if (assetFile) {
          const mime = getMimeType(resolvedPath);
          const dataUri = toDataUri(assetFile.data, mime) + (hash || '');
          return match.replace(href, dataUri);
        }
        warnings.push({
          code: 'MISSING_RESOURCE',
          message: `SVG içinde bulunamayan yerel kaynak: ${href}`,
          target: href,
        });
      }
    } else if (category === 'external-https' || category === 'external-protocol-relative') {
      warnings.push({
        code: 'EXTERNAL_RESOURCE',
        message: `SVG içinde harici kaynak bağlantısı: ${href}`,
        target: href,
      });
    }

    return match;
  });

  const bundledBytes = new TextEncoder().encode(html);
  if (bundledBytes.length > MAX_HTML_UNPACKED_BYTES) {
    return err({
      code: AppErrorCode.FILE_TOO_LARGE,
      message: `Paketlenen HTML boyutu açılmış sınırını aşıyor (maksimum 25 MB). Mevcut: ${bundledBytes.length} bayt.`,
    });
  }

  return ok({
    html,
    entryPath: entryFile.path,
    title,
    warnings,
    unpackedBytes: bundledBytes.length,
  });
}
