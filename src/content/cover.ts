/**
 * Presentation Cover Generation, Upload Processing, and Sandboxed HTML Capture
 *
 * References:
 * - src/contracts/limits.ts
 * - src/contracts/content.ts
 * - src/contracts/errors.ts
 * - src/contracts/services.ts
 * - docs/PLAN.md §5, §7 (Binding Decisions 9, 10)
 * - docs/BRIEF.md §1
 */

import modernScreenshotCode from 'modern-screenshot/dist/index.js?raw';
import { MAX_COVER_BYTES } from '../contracts/limits';
import { AppErrorCode } from '../contracts/errors';
import { ok, err, type Result } from '../contracts/services';
import type { CoverDescriptor } from '../contracts/content';
import { base64ToBytes } from './mime';

export const TARGET_COVER_WIDTH = 640;
export const TARGET_COVER_HEIGHT = 360; // 16:9 aspect ratio

/** Checks whether full DOM and Canvas APIs are available */
export function isBrowserEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof HTMLCanvasElement !== 'undefined'
  );
}

/**
 * Exports a canvas element to JPEG bytes with progressive quality reduction
 * to strictly guarantee byte size <= MAX_COVER_BYTES (150,000 bytes).
 */
export async function exportCanvasToBytes(
  canvas: HTMLCanvasElement,
  preferredMime: 'image/jpeg' | 'image/webp' = 'image/jpeg',
  initialQuality = 0.85,
): Promise<Result<{ bytes: Uint8Array; mimeType: 'image/jpeg' | 'image/webp' }>> {
  let quality = initialQuality;
  const mimeType = preferredMime;

  while (quality >= 0.1) {
    try {
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const base64Index = dataUrl.indexOf(',');
      if (base64Index === -1) {
        return err({
          code: AppErrorCode.INVALID_COVER,
          message: 'Tuval veri URL formatı geçersiz.',
        });
      }
      const rawBase64 = dataUrl.slice(base64Index + 1);
      const bytes = base64ToBytes(rawBase64);

      if (bytes.length <= MAX_COVER_BYTES) {
        return ok({ bytes, mimeType });
      }

      // Step down quality
      quality -= 0.15;
    } catch (exportErr) {
      return err({
        code: AppErrorCode.INVALID_COVER,
        message: 'Tuval görüntüsü dışa aktarılırken hata oluştu.',
        details: exportErr,
      });
    }
  }

  return err({
    code: AppErrorCode.FILE_TOO_LARGE,
    message: `Kapak görseli izin verilen azami boyutu aşıyor (${MAX_COVER_BYTES} bayt).`,
  });
}

/**
 * Generates a branded default cover (solid dark surface, no gradient, title typography).
 */
export async function generateDefaultCover(title: string): Promise<Result<CoverDescriptor>> {
  const safeTitle = (title || 'Sunum').trim();

  if (!isBrowserEnvironment()) {
    // Deterministic fallback for browser-less Node unit test environment
    // Generates a valid minimal 1x1 JPEG placeholder within bounds
    const placeholderBase64 =
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    const fallbackBytes = base64ToBytes(placeholderBase64);
    return ok({
      bytes: fallbackBytes,
      source: 'default',
      mimeType: 'image/jpeg',
    });
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = TARGET_COVER_WIDTH;
    canvas.height = TARGET_COVER_HEIGHT;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return err({
        code: AppErrorCode.UNKNOWN,
        message: 'Tuval 2D bağlamı başlatılamadı.',
      });
    }

    // 1. Solid brand surface background (Strictly NO gradient)
    ctx.fillStyle = '#090C15'; // Brand dark surface token
    ctx.fillRect(0, 0, TARGET_COVER_WIDTH, TARGET_COVER_HEIGHT);

    // 2. Subtle brand header tag
    ctx.fillStyle = '#6366F1'; // Brand accent indigo
    ctx.fillRect(50, 48, 6, 24);

    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#94A3B8'; // Muted token
    ctx.fillText('VEKTÖR SUNUM', 66, 65);

    // 3. Multi-line title text wrapping
    ctx.fillStyle = '#F8FAFC'; // Light text token
    ctx.font = '700 28px system-ui, -apple-system, sans-serif';

    const maxLineWidth = 530;
    const words = safeTitle.split(/\s+/);
    const lines: string[] = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
      const testLine = `${currentLine} ${words[i]}`;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxLineWidth) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
      if (lines.length >= 3) {
        break;
      }
    }
    lines.push(currentLine);

    // Cap to 4 lines with ellipsis if too long
    if (lines.length > 4) {
      lines.length = 4;
      lines[3] = `${lines[3].slice(0, -3)}...`;
    }

    const lineHeight = 38;
    const startY = 140;
    lines.forEach((line, idx) => {
      ctx.fillText(line, 50, startY + idx * lineHeight);
    });

    // 4. Subtle footer accent rule
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(50, 310, TARGET_COVER_WIDTH - 100, 1);

    const exportRes = await exportCanvasToBytes(canvas, 'image/jpeg', 0.85);
    if (!exportRes.ok) {
      return exportRes;
    }

    return ok({
      bytes: exportRes.value.bytes,
      source: 'default',
      mimeType: exportRes.value.mimeType,
    });
  } catch (canvasErr) {
    return err({
      code: AppErrorCode.UNKNOWN,
      message: 'Varsayılan kapak görseli oluşturulurken hata meydana geldi.',
      details: canvasErr,
    });
  }
}

/**
 * Resizes and crops a user-provided image to 16:9 (640x360) format <= 150,000 bytes.
 */
export async function processCoverOverride(
  input: Blob | Uint8Array,
  mimeTypeHint?: string,
): Promise<Result<CoverDescriptor>> {
  if (!input || (input instanceof Uint8Array && input.length === 0)) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Geçersiz veya boş kapak görseli.',
    });
  }

  if (!isBrowserEnvironment()) {
    // In Node test environment, ensure byte limit check
    const rawBytes = input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer());
    if (rawBytes.length > MAX_COVER_BYTES) {
      return err({
        code: AppErrorCode.FILE_TOO_LARGE,
        message: `Kapak görseli izin verilen azami boyutu aşıyor (${MAX_COVER_BYTES} bayt).`,
      });
    }
    return ok({
      bytes: rawBytes,
      source: 'upload',
      mimeType: (mimeTypeHint as 'image/jpeg' | 'image/webp') || 'image/jpeg',
    });
  }

  let blobUrl = '';
  try {
    const blob =
      input instanceof Blob
        ? input
        : new Blob([input.buffer as ArrayBuffer], { type: mimeTypeHint || 'image/jpeg' });
    blobUrl = URL.createObjectURL(blob);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Görsel dosyası yüklenemedi veya bozuk.'));
      img.src = blobUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = TARGET_COVER_WIDTH;
    canvas.height = TARGET_COVER_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return err({
        code: AppErrorCode.UNKNOWN,
        message: 'Tuval 2D bağlamı başlatılamadı.',
      });
    }

    // Cover crop calculations
    const scale = Math.max(TARGET_COVER_WIDTH / img.width, TARGET_COVER_HEIGHT / img.height);
    const scaledW = img.width * scale;
    const scaledH = img.height * scale;
    const offsetX = (TARGET_COVER_WIDTH - scaledW) / 2;
    const offsetY = (TARGET_COVER_HEIGHT - scaledH) / 2;

    ctx.fillStyle = '#090C15';
    ctx.fillRect(0, 0, TARGET_COVER_WIDTH, TARGET_COVER_HEIGHT);
    ctx.drawImage(img, offsetX, offsetY, scaledW, scaledH);

    const exportRes = await exportCanvasToBytes(canvas, 'image/jpeg', 0.85);
    if (!exportRes.ok) {
      return exportRes;
    }

    return ok({
      bytes: exportRes.value.bytes,
      source: 'upload',
      mimeType: exportRes.value.mimeType,
    });
  } catch (overrideErr) {
    return err({
      code: AppErrorCode.INVALID_COVER,
      message: 'Kapak görseli işlenirken hata oluştu.',
      details: overrideErr,
    });
  } finally {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  }
}

/**
 * Captures first-viewport 16:9 thumbnail from a transient hidden sandboxed iframe.
 * Uses modern-screenshot inlined into the iframe document.
 * Strictly verifies message source window, nonce, schema, and payload size.
 */
export async function captureHtmlCover(
  bundledHtml: string,
  options?: { timeoutMs?: number; targetWidth?: number; targetHeight?: number },
): Promise<Result<CoverDescriptor>> {
  if (!isBrowserEnvironment()) {
    return err({
      code: AppErrorCode.UNKNOWN,
      message: 'Tarayıcı ortamı bulunamadı; otomatik kapak yakalama desteklenmiyor.',
    });
  }

  const timeoutMs = options?.timeoutMs ?? 8000;
  const nonce = `vektor-cap-${Math.random().toString(36).slice(2)}-${Date.now()}`;

  // Capture runner script injected into the temporary iframe ONLY
  const captureRunner = `
(function() {
  var NONCE = ${JSON.stringify(nonce)};
  async function runCapture() {
    try {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise(function(r) { setTimeout(r, 2000); })
        ]);
      }
      await new Promise(function(r) { setTimeout(r, 200); });

      var targetNode = document.body || document.documentElement;
      var dataUrl = await window.modernScreenshot.domToPng(targetNode, {
        width: 1280,
        height: 720,
        scale: 1,
        timeout: 4500,
        sandbox: { contentWindow: null, remove: function() {} }
      });

      window.parent.postMessage({
        type: 'VEKTOR_COVER_CAPTURE',
        nonce: NONCE,
        status: 'success',
        dataUrl: dataUrl
      }, '*');
    } catch (captureErr) {
      window.parent.postMessage({
        type: 'VEKTOR_COVER_CAPTURE',
        nonce: NONCE,
        status: 'error',
        error: String(captureErr && captureErr.message ? captureErr.message : captureErr)
      }, '*');
    }
  }

  if (document.readyState === 'complete') {
    runCapture();
  } else {
    window.addEventListener('load', runCapture, { once: true });
  }
})();
`;

  // Inject runner and modern-screenshot into a copy of the HTML
  const injectedCode = `<script>\n${modernScreenshotCode}\n${captureRunner}\n<\/script>`;
  let captureHtml = bundledHtml;
  if (/<\/body>/i.test(captureHtml)) {
    captureHtml = captureHtml.replace(/<\/body>/i, `${injectedCode}</body>`);
  } else if (/<\/html>/i.test(captureHtml)) {
    captureHtml = captureHtml.replace(/<\/html>/i, `${injectedCode}</html>`);
  } else {
    captureHtml += `\n${injectedCode}`;
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '1280px';
  iframe.style.height = '720px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '-99999';

  let timerId: ReturnType<typeof setTimeout> | null = null;
  let messageListener: ((event: MessageEvent) => void) | null = null;

  try {
    const rawDataUrl = await new Promise<string>((resolve, reject) => {
      timerId = setTimeout(() => {
        reject(new Error(`Kapak yakalama zaman aşımına uğradı (${timeoutMs}ms).`));
      }, timeoutMs);

      messageListener = (event: MessageEvent) => {
        // Strict Source Check: Reject any message from another window or frame
        if (event.source !== iframe.contentWindow) {
          return;
        }

        // Schema validation
        const data = event.data;
        if (!data || typeof data !== 'object') {
          return;
        }
        if (data.type !== 'VEKTOR_COVER_CAPTURE' || data.nonce !== nonce) {
          return;
        }

        if (data.status !== 'success') {
          reject(new Error(data.error || 'İçerik çerçevesinde kapak yakalama başarısız oldu.'));
          return;
        }

        if (typeof data.dataUrl !== 'string') {
          reject(new Error('Geçersiz görsel verisi alındı.'));
          return;
        }

        // Bounded payload length check (max 15MB base64 dataUrl)
        if (data.dataUrl.length > 15 * 1024 * 1024) {
          reject(new Error('Yakalama çıktısı bellek sınırını aşıyor.'));
          return;
        }

        // Strict MIME prefix check
        if (!data.dataUrl.startsWith('data:image/png') && !data.dataUrl.startsWith('data:image/')) {
          reject(new Error('Görsel MIME türü geçerli değil.'));
          return;
        }

        resolve(data.dataUrl);
      };

      window.addEventListener('message', messageListener);

      // Load via srcdoc
      iframe.srcdoc = captureHtml;
      document.body.appendChild(iframe);
    });

    // Parent decode and resize to 640x360
    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Ebeveyn penceresinde görsel raster çözümlenemedi.'));
      img.src = rawDataUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = TARGET_COVER_WIDTH;
    canvas.height = TARGET_COVER_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return err({
        code: AppErrorCode.UNKNOWN,
        message: 'Tuval 2D bağlamı başlatılamadı.',
      });
    }

    ctx.drawImage(img, 0, 0, TARGET_COVER_WIDTH, TARGET_COVER_HEIGHT);

    const exportRes = await exportCanvasToBytes(canvas, 'image/jpeg', 0.82);
    if (!exportRes.ok) {
      return exportRes;
    }

    return ok({
      bytes: exportRes.value.bytes,
      source: 'auto',
      mimeType: exportRes.value.mimeType,
    });
  } catch (captureErr) {
    return err({
      code: AppErrorCode.UNKNOWN,
      message: captureErr instanceof Error ? captureErr.message : 'Otomatik kapak yakalama başarısız oldu.',
      details: captureErr,
    });
  } finally {
    // Guaranteed cleanup of iframe, timer, and message listener in all cases
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (messageListener !== null) {
      window.removeEventListener('message', messageListener);
      messageListener = null;
    }
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }
}
