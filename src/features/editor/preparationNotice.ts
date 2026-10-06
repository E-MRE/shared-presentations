import type { PipelineWarning } from '../../content';

/** Show only information that helps the author check the resulting presentation. */
export function preparationNotice(warnings: PipelineWarning[]): string {
  if (warnings.some(warning => ['MISSING_RESOURCE', 'INSECURE_RESOURCE', 'CYCLE_DETECTED', 'UNSUPPORTED_CONSTRUCT'].includes(warning.code))) {
    return 'Bazı görseller veya sunum özellikleri yüklenemeyebilir. Göndermeden önce önizlemeyi kontrol edin.';
  }
  if (warnings.some(warning => warning.code === 'EXTERNAL_RESOURCE')) {
    return 'Bu sunum bazı kaynakları internetten yükler. Göndermeden önce önizlemeyi kontrol edin.';
  }
  return '';
}
