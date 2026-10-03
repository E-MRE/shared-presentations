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
 * Validates raster magic bytes to prevent non-raster (like SVG) or corrupt uploads.
 * Supports JPEG, PNG, WebP, and GIF headers.
 */
export function isRasterImageBytes(
  bytes: Uint8Array,
): { ok: boolean; mimeType?: 'image/jpeg' | 'image/png' | 'image/webp' } {
  if (!bytes || bytes.length < 12) {
    return { ok: false };
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ok: true, mimeType: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { ok: true, mimeType: 'image/png' };
  }

  // WebP: RIFF .... WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ok: true, mimeType: 'image/webp' };
  }

  // GIF: GIF87a or GIF89a
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return { ok: true, mimeType: 'image/png' };
  }

  return { ok: false };
}

/**
 * Exports a canvas element to JPEG bytes with progressive quality reduction
 * to strictly guarantee byte size <= MAX_COVER_BYTES (150,000 bytes).
 */
export async function exportCanvasToBytes(
  canvas: HTMLCanvasElement,
  preferredMime: 'image/jpeg' | 'image/webp' = 'image/jpeg',
  initialQuality = 0.82,
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
 * Generates a branded default cover using approved tokens palette:
 * Solid dark canvas (#0C0E12), brand blue accent (#3B82F6), light title (#F9FAFB).
 * Strictly NO gradients. Target byte size <= 100 KB.
 */
export async function generateDefaultCover(title: string): Promise<Result<CoverDescriptor>> {
  const safeTitle = (title || 'Sunum').trim();

  if (!isBrowserEnvironment()) {
    // Deterministic fallback for browser-less Node test environment
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

    // 1. Solid dark canvas background (#0C0E12 - tokens.css --bg-canvas)
    ctx.fillStyle = '#0C0E12';
    ctx.fillRect(0, 0, TARGET_COVER_WIDTH, TARGET_COVER_HEIGHT);

    // 2. Subtle brand tag badge (#3B82F6 - tokens.css --primitive-blue-500)
    ctx.fillStyle = '#3B82F6';
    ctx.fillRect(50, 48, 5, 22);

    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#94A3B8'; // tokens.css --text-secondary
    ctx.fillText('VEKTÖR SUNUM', 66, 64);

    // 3. Multi-line title typography (#F9FAFB - tokens.css --primitive-gray-50)
    ctx.fillStyle = '#F9FAFB';
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

    if (lines.length > 4) {
      lines.length = 4;
      lines[3] = `${lines[3].slice(0, -3)}...`;
    }

    const lineHeight = 38;
    const startY = 140;
    lines.forEach((line, idx) => {
      ctx.fillText(line, 50, startY + idx * lineHeight);
    });

    // 4. Subtle footer separator rule (tokens.css --border-subtle)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(50, 310, TARGET_COVER_WIDTH - 100, 1);

    const exportRes = await exportCanvasToBytes(canvas, 'image/jpeg', 0.82);
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
 * Strictly validates raster magic bytes to reject SVG or invalid uploads.
 */
export async function processCoverOverride(
  input: Blob | Uint8Array,
  mimeTypeHint?: string,
): Promise<Result<CoverDescriptor>> {
  if (!input) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Geçersiz veya boş kapak görseli.',
    });
  }

  const rawBytes =
    input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer());

  if (rawBytes.length === 0) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Kapak görseli boş olamaz.',
    });
  }

  if (rawBytes.length > MAX_COVER_BYTES) {
    return err({
      code: AppErrorCode.FILE_TOO_LARGE,
      message: `Kapak görseli izin verilen azami boyutu aşıyor (${MAX_COVER_BYTES} bayt). Mevcut: ${rawBytes.length} bayt.`,
    });
  }

  // Validate raster magic bytes (reject SVG or arbitrary non-image payload)
  const rasterCheck = isRasterImageBytes(rawBytes);
  if (!rasterCheck.ok) {
    return err({
      code: AppErrorCode.INVALID_COVER,
      message:
        'Geçersiz veya desteklenmeyen kapak formatı: sadece JPEG, PNG ve WebP raster formatları desteklenir (SVG desteklenmez).',
    });
  }

  if (!isBrowserEnvironment()) {
    return ok({
      bytes: rawBytes,
      source: 'upload',
      mimeType: (rasterCheck.mimeType || mimeTypeHint || 'image/jpeg') as
        | 'image/jpeg'
        | 'image/webp'
        | 'image/png',
    });
  }

  let blobUrl = '';
  try {
    const blob =
      input instanceof Blob
        ? input
        : new Blob([rawBytes.buffer as ArrayBuffer], {
            type: rasterCheck.mimeType || mimeTypeHint || 'image/jpeg',
          });
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

    ctx.fillStyle = '#0C0E12';
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
 * Strictly enforces a single <= 8000ms deadline covering load, font readiness,
 * screenshot capture, postMessage delivery, parent Image decode, and canvas resize.
 * Rejects SVG and non-raster formats before parent Image decode.
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

  const rawTimeout = options?.timeoutMs ?? 8000;
  const timeoutMs = Math.min(
    Math.max(100, typeof rawTimeout === 'number' && Number.isFinite(rawTimeout) ? rawTimeout : 8000),
    8000,
  );
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

  // Single deadline covering entire lifecycle (iframe, message, raster decode, resize)
  const deadlinePromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(`Kapak yakalama zaman aşımına uğradı (${timeoutMs}ms).`));
    }, timeoutMs);
  });

  const captureLifecycle = new Promise<CoverDescriptor>((resolve, reject) => {
    messageListener = async (event: MessageEvent) => {
      // 1. Strict Source Check: Reject any message from another window or frame
      if (event.source !== iframe.contentWindow) {
        return;
      }

      // 2. Schema validation
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

      // Bounded payload length check (max 10MB)
      if (data.dataUrl.length > 10 * 1024 * 1024) {
        reject(new Error('Yakalama çıktısı bellek sınırını aşıyor.'));
        return;
      }

      // Strict raster MIME and base64 structure validation BEFORE new Image()
      // Reject SVG (image/svg+xml), invalid MIME, or corrupt base64
      const RASTER_BASE64_REGEX = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
      const match = RASTER_BASE64_REGEX.exec(data.dataUrl);
      if (!match) {
        reject(
          new Error(
            'Desteklenmeyen veya geçersiz kapak MIME türü: sadece PNG, JPEG ve WebP desteklenir (SVG reddedildi).',
          ),
        );
        return;
      }

      // Parent raster decode and canvas resize to 640x360
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise<void>((imgResolve, imgReject) => {
          img.onload = () => imgResolve();
          img.onerror = () =>
            imgReject(new Error('Ebeveyn penceresinde raster görsel çözümlenemedi.'));
          img.src = data.dataUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = TARGET_COVER_WIDTH;
        canvas.height = TARGET_COVER_HEIGHT;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Tuval 2D bağlamı başlatılamadı.'));
          return;
        }

        ctx.drawImage(img, 0, 0, TARGET_COVER_WIDTH, TARGET_COVER_HEIGHT);

        const exportRes = await exportCanvasToBytes(canvas, 'image/jpeg', 0.82);
        if (!exportRes.ok) {
          reject(new Error(exportRes.error.message));
          return;
        }

        resolve({
          bytes: exportRes.value.bytes,
          source: 'auto',
          mimeType: exportRes.value.mimeType,
        });
      } catch (decodeErr) {
        reject(decodeErr instanceof Error ? decodeErr : new Error(String(decodeErr)));
      }
    };

    window.addEventListener('message', messageListener);
    iframe.srcdoc = captureHtml;
    document.body.appendChild(iframe);
  });

  try {
    const result = await Promise.race([captureLifecycle, deadlinePromise]);
    return ok(result);
  } catch (captureErr) {
    return err({
      code: AppErrorCode.UNKNOWN,
      message:
        captureErr instanceof Error
          ? captureErr.message
          : 'Otomatik kapak yakalama başarısız oldu.',
      details: captureErr,
    });
  } finally {
    // Guaranteed unconditional cleanup of timer, event listener, and iframe in all cases
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
