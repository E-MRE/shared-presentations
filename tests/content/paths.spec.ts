/**
 * Unit Test Suite: Path Normalization, Traversal Prevention, and URL Classification
 *
 * References:
 * - src/content/paths.ts
 * - docs/PLAN.md §5, §7
 * - docs/BRIEF.md §1
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  isPathTraversal,
  resolveRelativePath,
  getDirectoryName,
  classifyUrl,
  stripCommonRoot,
  stripQueryAndHash,
} from '../../src/content/paths';

describe('Path Normalization and Traversal Prevention Suite', () => {
  describe('normalizePath', () => {
    it('normalizes simple relative paths', () => {
      expect(normalizePath('index.html')).toBe('index.html');
      expect(normalizePath('css/style.css')).toBe('css/style.css');
      expect(normalizePath('./css/sub/../style.css')).toBe('css/style.css');
    });

    it('converts backslashes to forward slashes', () => {
      expect(normalizePath('assets\\images\\logo.png')).toBe('assets/images/logo.png');
      expect(normalizePath('.\\styles\\main.css')).toBe('styles/main.css');
    });

    it('decodes percent-encoded characters', () => {
      expect(normalizePath('assets/my%20presentation/slide1.html')).toBe(
        'assets/my presentation/slide1.html',
      );
    });

    it('rejects path traversal attempting to escape root', () => {
      expect(normalizePath('../secret.txt')).toBe('');
      expect(normalizePath('css/../../secret.txt')).toBe('');
      expect(normalizePath('foo/bar/../../../root.txt')).toBe('');
      expect(normalizePath('%2e%2e/escaped.txt')).toBe('');
      expect(normalizePath('%2E%2E/escaped.txt')).toBe('');
    });

    it('rejects Windows drive letters and null bytes', () => {
      expect(normalizePath('C:\\Windows\\System32')).toBe('');
      expect(normalizePath('D:/presentations/index.html')).toBe('');
      expect(normalizePath('assets/image\0.png')).toBe('');
    });

    it('strips redundant leading slashes safely without escaping root', () => {
      expect(normalizePath('/index.html')).toBe('index.html');
      expect(normalizePath('///assets/style.css')).toBe('assets/style.css');
    });
  });

  describe('isPathTraversal', () => {
    it('detects directory traversal patterns', () => {
      expect(isPathTraversal('../outside.txt')).toBe(true);
      expect(isPathTraversal('assets/../../outside.txt')).toBe(true);
      expect(isPathTraversal('/absolute/path')).toBe(true);
      expect(isPathTraversal('C:\\boot.ini')).toBe(true);
      expect(isPathTraversal('%2e%2e/traversal')).toBe(true);
      expect(isPathTraversal('foo/\0/bar')).toBe(true);
    });

    it('permits safe interior relative paths', () => {
      expect(isPathTraversal('index.html')).toBe(false);
      expect(isPathTraversal('css/style.css')).toBe(false);
      expect(isPathTraversal('css/nested/../style.css')).toBe(false);
      expect(isPathTraversal('assets/images/bg.jpg')).toBe(false);
    });
  });

  describe('resolveRelativePath', () => {
    it('resolves relative paths from containing directory', () => {
      expect(resolveRelativePath('css', '../images/logo.png')).toBe('images/logo.png');
      expect(resolveRelativePath('css/sub', '../fonts/font.woff2')).toBe(
        'css/fonts/font.woff2',
      );
      expect(resolveRelativePath('', './style.css')).toBe('style.css');
      expect(resolveRelativePath('src/components', './button.css')).toBe(
        'src/components/button.css',
      );
    });

    it('strips query strings and hash anchors during resolution', () => {
      expect(resolveRelativePath('css', 'main.css?v=1.2.3')).toBe('css/main.css');
      expect(resolveRelativePath('assets', 'icons.svg#chevron-right')).toBe(
        'assets/icons.svg',
      );
    });

    it('returns empty string if resolved path attempts traversal escaping root', () => {
      expect(resolveRelativePath('css', '../../secret.txt')).toBe('');
      expect(resolveRelativePath('', '../escaped.png')).toBe('');
    });
  });

  describe('stripQueryAndHash', () => {
    it('separates path, query, and hash', () => {
      const res = stripQueryAndHash('styles.css?v=42#main-theme');
      expect(res.cleanPath).toBe('styles.css');
      expect(res.query).toBe('?v=42');
      expect(res.hash).toBe('#main-theme');
    });

    it('handles paths without query or hash', () => {
      const res = stripQueryAndHash('images/logo.png');
      expect(res.cleanPath).toBe('images/logo.png');
      expect(res.query).toBe('');
      expect(res.hash).toBe('');
    });
  });

  describe('getDirectoryName', () => {
    it('extracts parent directory name from relative path', () => {
      expect(getDirectoryName('css/sub/deep/style.css')).toBe('css/sub/deep');
      expect(getDirectoryName('css/style.css')).toBe('css');
      expect(getDirectoryName('index.html')).toBe('');
    });
  });

  describe('classifyUrl', () => {
    it('classifies URLs into accurate categories', () => {
      expect(classifyUrl('https://fonts.googleapis.com/css2')).toBe('external-https');
      expect(classifyUrl('http://insecure.site/test.js')).toBe('external-http');
      expect(classifyUrl('//cdn.example.com/lib.js')).toBe('external-protocol-relative');
      expect(classifyUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('data-uri');
      expect(classifyUrl('blob:http://localhost/uuid')).toBe('blob-uri');
      expect(classifyUrl('#slide-3')).toBe('fragment-only');
      expect(classifyUrl('javascript:alert(1)')).toBe('dangerous');
      expect(classifyUrl('vbscript:msgbox(1)')).toBe('dangerous');
      expect(classifyUrl('data:text/html,<script>alert(1)</script>')).toBe('dangerous');
      expect(classifyUrl('mailto:info@vektor.com')).toBe('external-other');
      expect(classifyUrl('./styles/main.css')).toBe('relative');
      expect(classifyUrl('../assets/logo.png')).toBe('relative');
      expect(classifyUrl('bundle.js')).toBe('relative');
    });
  });

  describe('stripCommonRoot', () => {
    it('strips common directory if all files share a top-level folder', () => {
      const paths = [
        'my-presentation/index.html',
        'my-presentation/css/style.css',
        'my-presentation/images/bg.png',
      ];
      const { prefix, strippedMap } = stripCommonRoot(paths);
      expect(prefix).toBe('my-presentation/');
      expect(strippedMap.get('my-presentation/index.html')).toBe('index.html');
      expect(strippedMap.get('my-presentation/css/style.css')).toBe('css/style.css');
      expect(strippedMap.get('my-presentation/images/bg.png')).toBe('images/bg.png');
    });

    it('does not strip if files do not share a single top-level folder', () => {
      const paths = ['index.html', 'css/style.css', 'images/bg.png'];
      const { prefix, strippedMap } = stripCommonRoot(paths);
      expect(prefix).toBe('');
      expect(strippedMap.get('index.html')).toBe('index.html');
      expect(strippedMap.get('css/style.css')).toBe('css/style.css');
    });
  });
});
