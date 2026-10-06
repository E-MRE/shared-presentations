import { StatePanel } from '../../components/StatePanel';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Deck } from '../../contracts/models';
import { AppErrorCode, type AppError } from '../../contracts/errors';
import { validDeckId } from './validation';
import { EditorForm } from './EditorForm';
import { productionContent, type EditorContent, type EditorPageProps, type PresentationEditorProps } from './types';
import './editor.css';

const identities = new WeakMap<object, number>();
let sequence = 0;
function identity(value: object) { if (!identities.has(value)) identities.set(value, ++sequence); return identities.get(value); }
export function UploadPage(props: EditorPageProps) {
  const navigate = useNavigate();
  return <PresentationEditor {...props} mode="create" onClose={props.onClose ?? (() => navigate('/benim'))} onComplete={props.onComplete ?? (deck => navigate(`/s/${encodeURIComponent(deck.id)}`, { replace: true }))} />;
}
export function EditPage(props: EditorPageProps) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  return <PresentationEditor {...props} mode="edit" id={id} onClose={props.onClose ?? (() => navigate('/benim'))} onComplete={props.onComplete ?? (deck => navigate(`/s/${encodeURIComponent(deck.id)}`, { replace: true }))} />;
}
function Notice({ message, onClose, error = false, retry }: { message: string; onClose?: () => void; error?: boolean; retry?: () => void }) {
  return <section className="vektor-editor" aria-label="Sunum düzenleyici"><button className="btn btn-secondary" onClick={onClose}>Geri dön</button><StatePanel heading="h1" title={message} kind={error ? 'error' : message.includes('yükleniyor') ? 'loading' : 'empty'}>{retry && <button className="btn btn-secondary" onClick={retry}>Yeniden dene</button>}</StatePanel></section>;
}
export function PresentationEditor({ auth, mode = 'create', id, service, content, onClose, onComplete }: PresentationEditorProps) {
  if (auth.status !== 'authenticated' || !auth.isMember || !auth.user.isMember) return <Notice onClose={onClose} message={auth.status === 'loading' ? 'Oturum kontrol ediliyor…' : auth.status === 'unverified' ? 'Sunum yüklemek için e-posta adresinizi doğrulayın.' : 'Sunum yüklemek için giriş yapın.'} />;
  if (mode === 'edit' && !validDeckId(id)) return <Notice message="Geçerli bir sunum kimliği bulunamadı." error onClose={onClose} />;
  const api: EditorContent = { prepare: content?.prepare ?? productionContent.prepare, processCover: content?.processCover ?? productionContent.processCover, reconstruct: content?.reconstruct ?? productionContent.reconstruct, defaultCover: content?.defaultCover ?? productionContent.defaultCover };
  const key = JSON.stringify([mode, id, auth.user.uid, auth.isAdmin, auth.user.isAdmin, identity(service), ...Object.values(api).map(identity)]);
  return <Session key={key} mode={mode} id={id} uid={auth.user.uid} service={service} content={api} onClose={onClose} onComplete={onComplete} />;
}
function errorMessage(error: AppError) {
  if (error.code === AppErrorCode.NOT_FOUND) return 'Sunum bulunamadı.';
  if (error.code === AppErrorCode.PERMISSION_DENIED) return 'Bu sunumu düzenleme izniniz yok.';
  return 'Sunum bilgileri yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.';
}
function Session({ mode, id, uid, service, content, onClose, onComplete }: Omit<PresentationEditorProps, 'auth' | 'content'> & { uid: string; content: EditorContent }) {
  const alive = useRef(true);
  const [deck, setDeck] = useState<Deck | undefined>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (mode !== 'edit') return;
    let current = true;
    void (async () => {
      try {
        const result = await service.getDeck(id!);
        if (!current || !alive.current) return;
        if (!result.ok) { setError(errorMessage(result.error)); return; }
        if (result.value.id !== id || result.value.ownerUid !== uid) { setError('Yalnızca kendi sunumunuzu düzenleyebilirsiniz.'); return; }
        setDeck(result.value);
      } catch { if (current && alive.current) setError('Sunum bilgileri yüklenemedi. Yeniden deneyin.'); }
    })();
    return () => { current = false; };
  }, [mode, id, uid, service, attempt]);
  if (error) return <Notice message={error} error onClose={onClose} retry={() => { setError(''); setAttempt(value => value + 1); }} />;
  if (mode === 'edit' && !deck) return <Notice message="Sunum bilgileri yükleniyor…" onClose={onClose} />;
  return <EditorForm deck={deck} service={service} content={content} onClose={onClose} onComplete={onComplete} />;
}
