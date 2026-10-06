import { useCallback, useId, useRef, useState } from 'react';
import { PresentationLink } from '../../components/PresentationLink';
import { useSearchParams } from 'react-router-dom';
import type { AuthState } from '../../contracts/auth';
import type { Deck } from '../../contracts/models';
import type { PaginatedQueryInput, PresentationDataService, ReviewDeckInput } from '../../contracts/services';
import { DeckCard, Modal } from '../../components';
import { LibraryGate, ListFeedback, PageIntro } from '../library/LibraryUI';
import { dependencyKey, memberKey } from '../library/session';
import { useDeckPages } from '../library/useDeckPages';
import { useDeckMutation } from '../library/useDeckMutation';
import type { AdminReadAdapter } from './adapter';
import { PendingBadge } from './PendingBadge';
import './admin.css';
export interface AdminPageProps { auth: AuthState; service: PresentationDataService; adapter: AdminReadAdapter; /** Disable when the shared Header already announces this count. */ showPendingBadge?: boolean; }
type DialogTarget = { deck: Deck; action: 'reject' | 'unpublish' | 'delete' };
/** Mirrors the frozen Firestore rule cap; the shared service only checks nonempty. */
const REJECT_NOTE_LIMIT = 1000;
function AdminSession({ auth, service, adapter, showPendingBadge = true }: AdminPageProps) {
  const pendingLoad = useCallback((input: PaginatedQueryInput) => service.getReviewQueue(input), [service]);
  const allLoad = useCallback((input: PaginatedQueryInput) => adapter.getAllDecks(input), [adapter]);
  const pending = useDeckPages(pendingLoad, 'oldest', false, `queue:${memberKey(auth)}:${dependencyKey(service)}`);
  const all = useDeckPages(allLoad, 'updated', false, `all:${memberKey(auth)}:${dependencyKey(adapter)}`);
  const [params, setParams] = useSearchParams();
  const tab = params.get('sekme') === 'all' ? 'all' : 'pending';
  const setTab = (value: 'pending' | 'all') => setParams(value === 'all' ? { sekme: 'all' } : {}, { replace: true });
  const [target, setTarget] = useState<DialogTarget | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const noteId = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const mutation = useDeckMutation(() => { pending.refresh(); all.refresh(); });
  const list = tab === 'pending' ? pending : all;
  const items = list.items.filter(deck => tab !== 'pending' || deck.status === 'pending');
  function eligible(deck: Deck, action: ReviewDeckInput['action'] | 'delete') {
    return action === 'delete' || (action === 'approve' || action === 'reject' ? deck.status === 'pending' : action === 'unpublish' ? deck.status === 'published' : deck.status === 'rejected' || deck.status === 'unpublished');
  }
  function open(deck: Deck, action: DialogTarget['action']) { if (mutation.busy) return; mutation.reset(); setNote(''); setNoteError(''); setTarget({ deck, action }); }
  async function perform(deck: Deck, action: ReviewDeckInput['action'] | 'delete') {
    if (!eligible(deck, action) || !list.items.some(item => item.id === deck.id && eligible(item, action))) return;
    const trimmed = note.trim();
    if (action === 'reject' && (!trimmed || trimmed.length > REJECT_NOTE_LIMIT)) {
      setNoteError(!trimmed ? 'Ret gerekçesi zorunludur.' : 'Ret gerekçesi en fazla 1000 karakter olabilir.'); textarea.current?.focus(); return;
    }
    const success = await mutation.run(() => action === 'delete' ? service.deleteDeck({ id: deck.id }) : service.reviewDeck({ id: deck.id, action, ...(action === 'reject' ? { rejectNote: trimmed } : {}) }), action === 'delete' ? 'Sunum silindi.' : 'Sunumun durumu güncellendi.');
    if (success) setTarget(null);
  }
  const close = () => { if (!mutation.busy) setTarget(null); };
  return <section className="vektor-library vektor-admin"><PageIntro title="Onay Masası" description="Ekibin sunumlarını inceleyin ve arşivi yönetin.">{showPendingBadge && <PendingBadge auth={auth} adapter={adapter}/>}</PageIntro><div className="main-content"><div className="vektor-admin-tabs" role="group" aria-label="İnceleme listesi"><button className={`btn ${tab === 'pending' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={tab === 'pending'} disabled={mutation.busy || !!target} onClick={() => setTab('pending')}>Bekleyenler</button><button className={`btn ${tab === 'all' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={tab === 'all'} disabled={mutation.busy || !!target} onClick={() => setTab('all')}>Tüm Sunumlar</button></div><p className="vektor-list-summary">{tab === 'pending' ? 'İlk yüklenen sunum önce gösterilir.' : 'Son güncellenen sunum önce gösterilir.'}</p><ListFeedback loading={list.loading} error={list.error} retry={list.refresh} empty={!items.length} emptyText={tab === 'pending' ? 'İncelenecek sunum kalmadı' : 'Henüz sunum yok'}/><div className="deck-grid">{items.map(deck => <DeckCard key={deck.id} deck={deck} showRejectNote actions={<><PresentationLink className="vektor-review-control btn btn-secondary" id={deck.id}>Önizle</PresentationLink>{deck.status === 'pending' && <><button className="vektor-review-control btn btn-primary" disabled={mutation.busy} onClick={() => void perform(deck, 'approve')}>Onayla</button><button className="vektor-review-control btn btn-secondary vektor-admin-reject" disabled={mutation.busy} onClick={() => open(deck, 'reject')}>Reddet</button></>}{deck.status === 'published' && <button className="vektor-review-control btn btn-ghost" disabled={mutation.busy} onClick={() => open(deck, 'unpublish')}>Yayından kaldır</button>}{(deck.status === 'rejected' || deck.status === 'unpublished') && <button className="vektor-review-control btn btn-primary" disabled={mutation.busy} onClick={() => void perform(deck, 'reapprove')}>Yeniden onayla</button>}<button className="vektor-review-control btn btn-secondary vektor-admin-delete" disabled={mutation.busy} onClick={() => open(deck, 'delete')}>Sil</button></>}/>)}</div>{list.hasMore && <button className="vektor-review-control btn btn-secondary vektor-load-more" disabled={list.loading || mutation.busy} onClick={list.more}>Daha fazla göster</button>}</div><Modal open={!!target} title={target?.action === 'reject' ? 'Sunumu reddet' : target?.action === 'unpublish' ? 'Sunumu yayından kaldır' : 'Sunumu sil'} description={target?.action === 'delete' ? 'Bu işlem geri alınamaz.' : target?.action === 'reject' ? 'Sunum sahibi ret gerekçenizi görecek.' : 'Sunum ortak arşivden kaldırılacak.'} onClose={close} initialFocus={target?.action === 'reject' ? textarea : cancel} footer={<><button className="vektor-review-control btn btn-secondary" ref={cancel} disabled={mutation.busy} onClick={close}>Vazgeç</button><button className="vektor-review-control btn btn-primary" disabled={mutation.busy} onClick={() => { if (target) void perform(target.deck, target.action); }}>{mutation.busy ? 'İşleniyor…' : target?.action === 'reject' ? 'Reddet' : target?.action === 'unpublish' ? 'Yayından kaldır' : 'Sunumu sil'}</button></>}><p className="vektor-admin-target">“{target?.deck.title}”</p>{target?.action === 'reject' ? <div className="form-group"><label className="form-label" htmlFor={noteId}>Ret gerekçesi (zorunlu)</label><textarea ref={textarea} id={noteId} className="form-textarea vektor-admin-note" required value={note} disabled={mutation.busy} aria-invalid={!!noteError} aria-describedby={`${noteId}-hint${noteError ? ` ${noteId}-error` : ''}`} onChange={event => { setNote(event.target.value); setNoteError(''); }}/><p className="form-hint vektor-admin-hint" id={`${noteId}-hint`}>En fazla 1000 karakter. Ne geliştirilmesi gerektiğini açıklayın.</p>{noteError && <p role="alert" id={`${noteId}-error`}>{noteError}</p>}</div> : <p>{target?.action === 'delete' ? 'Sunumu ve tüm içeriğini silmek istediğinize emin misiniz?' : 'Sunumu yayından kaldırmak istediğinize emin misiniz?'}</p>}</Modal></section>;
}
export function AdminPage(props: AdminPageProps) {
  const key = memberKey(props.auth);
  return key && props.auth.isAdmin ? <AdminSession key={`${key}:${dependencyKey(props.service)}:${dependencyKey(props.adapter)}`} {...props}/> : <LibraryGate auth={props.auth} admin/>;
}
