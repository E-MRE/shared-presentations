import { reconstructPresentation as reconstructContent } from '../../content/chunks';
import type { AuthState } from '../../contracts/auth';
import type { Deck } from '../../contracts/models';
import type { PresentationDataService } from '../../contracts/services';
import type { preparePresentation, processCoverOverride, reconstructPresentation, generateDefaultCover } from '../../content';
import { AppErrorCode } from '../../contracts/errors';
import { err } from '../../contracts/services';

export type EditorService = Pick<PresentationDataService, 'getDeck' | 'getAllChunks' | 'createDeck' | 'updateDeck'>;
export interface EditorContent {
  prepare: typeof preparePresentation;
  processCover: typeof processCoverOverride;
  reconstruct: typeof reconstructPresentation;
  defaultCover: typeof generateDefaultCover;
}
export interface PresentationEditorProps {
  auth: AuthState;
  service: EditorService;
  mode?: 'create' | 'edit';
  id?: string;
  content?: Partial<EditorContent>;
  onComplete?: (deck: Deck) => void;
  onClose?: () => void;
}
export type EditorPageProps = Omit<PresentationEditorProps, 'mode' | 'id'>;
export const productionContent: EditorContent = {
  prepare: async (...args) => {
    // A stale preview/deployment tab can lose its lazy chunk. Retrying the file
    // cannot repair that; tell the user to refresh rather than hide the cause.
    let pipeline;
    try { pipeline = await import('../../content/pipeline'); }
    catch { return err({ code: AppErrorCode.NETWORK_ERROR, message: 'Sunum hazırlama bileşeni yüklenemedi. Sayfayı yenileyip dosyayı tekrar seçin.' }); }
    return pipeline.preparePresentation(...args);
  },
  processCover: async (...args) => (await import('../../content/cover')).processCoverOverride(...args),
  reconstruct: (...args) => reconstructContent(...args),
  defaultCover: async (...args) => (await import('../../content/cover')).generateDefaultCover(...args),
};
