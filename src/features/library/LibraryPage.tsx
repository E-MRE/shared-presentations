import { useCallback, useId, useState } from 'react';
import type { AuthState } from '../../contracts/auth';
import type { PresentationDataService, PaginatedQueryInput } from '../../contracts/services';
import { DeckCard } from '../../components';
import { LibraryGate, ListFeedback, PageIntro } from './LibraryUI';
import { dependencyKey, memberKey } from './session';
import { useDeckPages } from './useDeckPages';
export interface LibraryPageProps { auth: AuthState; service: PresentationDataService; }
function LibrarySession({ service }: LibraryPageProps) {
  const load = useCallback((input: PaginatedQueryInput) => service.getPublishedFeed(input), [service]);
  const list = useDeckPages(load, 'published', true);
  const [search, setSearch] = useState('');
  const searchId = useId();
  const query = search.trim().toLocaleLowerCase('tr-TR');
  const items = list.items.filter(deck => deck.status === 'published' && [deck.title, deck.description, deck.ownerName ?? ''].some(text => text.toLocaleLowerCase('tr-TR').includes(query)));
  return <section className="vektor-library"><PageIntro title="Sunum Arşivi" description="Ekibin fikirleri, bilgisi ve ilhamı. Onaylanmış sunumları keşfedin."/><div className="main-content"><div className="vektor-library-search"><label htmlFor={searchId}>Sunum ara</label><div className="vektor-search-row"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input id={searchId} type="search" className="form-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Başlık, açıklama veya sunan kişi"/>{search && <button className="btn btn-ghost" onClick={() => setSearch('')}>Temizle</button>}</div></div><p role="status" aria-atomic="true" className="vektor-list-summary">{items.length} sunum{list.loading ? ' · Arşiv yükleniyor' : ''}</p><ListFeedback loading={list.loading} error={list.error} retry={list.refresh} empty={!items.length} emptyText={query ? 'Aramanızla eşleşen sunum bulunamadı' : 'Henüz yayınlanmış sunum yok'}/><div className="deck-grid">{items.map(deck => <DeckCard key={deck.id} deck={deck}/>)}</div></div></section>;
}
export function LibraryPage(props: LibraryPageProps) {
  const key = memberKey(props.auth);
  return key ? <LibrarySession key={`${key}:${dependencyKey(props.service)}`} {...props}/> : <LibraryGate auth={props.auth}/>;
}
