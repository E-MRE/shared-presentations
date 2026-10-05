import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuthState } from '../../contracts/auth';
import type { Deck } from '../../contracts/models';
import type { PresentationDataService, PaginatedQueryInput } from '../../contracts/services';
import { DeckCard, Modal } from '../../components';
import { LibraryGate, ListFeedback, PageIntro } from './LibraryUI';
import { dependencyKey, memberKey } from './session';
import { useDeckPages } from './useDeckPages';
import { useDeckMutation } from './useDeckMutation';
export interface MyDecksPageProps { auth: AuthState; service: PresentationDataService; }
function MyDecksSession({ auth, service }: MyDecksPageProps) {
  const uid = auth.user!.uid;
  const load = useCallback((input: PaginatedQueryInput) => service.getMyDecks(uid, input), [service, uid]);
  const list = useDeckPages(load, 'updated');
  const [target, setTarget] = useState<Deck | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const mutation = useDeckMutation(list.refresh);
  const items = list.items.filter(deck => deck.ownerUid === uid);
  const canDelete = (deck: Deck) => deck.ownerUid === uid && (deck.status !== 'published' || auth.isAdmin);
  async function remove() {
    if (!target || !canDelete(target) || !items.some(deck => deck.id === target.id && canDelete(deck))) return;
    if (await mutation.run(() => service.deleteDeck({ id: target.id }), 'Sunum silindi.')) setTarget(null);
  }
  return <section className="vektor-library"><PageIntro title="Benim Sunumlarım" description="Sunumlarınızın durumunu takip edin, düzenleyin ve ekiple paylaşın."><Link className="vektor-review-control btn btn-primary" to="/yeni">Yeni Sunum Yükle</Link></PageIntro><div className="main-content"><div role="status" aria-atomic="true" className="vektor-list-summary">{mutation.message || `${items.length} sunum`}</div>{!target && mutation.error && <p role="alert">{mutation.error}</p>}<ListFeedback loading={list.loading} error={list.error} retry={list.refresh} empty={!items.length} emptyText="Henüz sunum yüklemediniz"/><div className="deck-grid">{items.map(deck => <DeckCard key={deck.id} deck={deck} showRejectNote actions={<><Link className="vektor-review-control btn btn-secondary" to={`/s/${encodeURIComponent(deck.id)}`}>Önizle</Link><Link className="vektor-review-control btn btn-ghost" to={`/duzenle/${encodeURIComponent(deck.id)}`}>Düzenle</Link>{canDelete(deck) && <button className="vektor-review-control btn btn-ghost vektor-danger" disabled={mutation.busy} onClick={() => { mutation.reset(); setTarget(deck); }}>Sil</button>}</>}/>)}</div>{list.hasMore && <button className="vektor-review-control btn btn-secondary vektor-load-more" disabled={list.loading || mutation.busy} onClick={list.more}>Daha fazla göster</button>}</div><Modal open={!!target} title="Sunumu sil" description="Bu işlem geri alınamaz." onClose={() => { if (!mutation.busy) setTarget(null); }} initialFocus={cancel} footer={<><button ref={cancel} className="vektor-review-control btn btn-secondary" disabled={mutation.busy} onClick={() => setTarget(null)}>Vazgeç</button><button className="vektor-review-control btn btn-primary" disabled={mutation.busy} onClick={() => void remove()}>{mutation.busy ? 'Siliniyor…' : 'Sunumu sil'}</button></>}><p>“{target?.title}” sunumunu ve tüm içeriğini silmek istediğinize emin misiniz?</p>{mutation.error && <p role="alert">{mutation.error}</p>}</Modal></section>;
}
export function MyDecksPage(props: MyDecksPageProps) {
  const key = memberKey(props.auth);
  return key ? <MyDecksSession key={`${key}:${dependencyKey(props.service)}`} {...props}/> : <LibraryGate auth={props.auth}/>;
}
