import { reconstructPresentation as reconstructContent } from '../../content/chunks';
import type { AuthState } from '../../contracts/auth';
import type { Deck } from '../../contracts/models';
import type { PresentationDataService } from '../../contracts/services';
import type { preparePresentation, processCoverOverride, reconstructPresentation, generateDefaultCover } from '../../content';

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
  prepare: async (...args) => (await import('../../content/pipeline')).preparePresentation(...args),
  processCover: async (...args) => (await import('../../content/cover')).processCoverOverride(...args),
  reconstruct: (...args) => reconstructContent(...args),
  defaultCover: async (...args) => (await import('../../content/cover')).generateDefaultCover(...args),
};
