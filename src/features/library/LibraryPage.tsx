import { useCallback, useId } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import type { AuthState } from '../../contracts/auth';
import type { PresentationDataService, PaginatedQueryInput } from '../../contracts/services';
import { DECK_CATEGORIES, categoryLabel } from '../../contracts/catalog';
import { DeckCard } from '../../components';
import { LibraryGate, ListFeedback, PageIntro } from './LibraryUI';
import { dependencyKey, memberKey } from './session';
import { useDeckPages } from './useDeckPages';
export interface LibraryPageProps { auth: AuthState; service: PresentationDataService; }
function LibrarySession({ auth, service }: LibraryPageProps) {
  const load = useCallback((input: PaginatedQueryInput) => service.getPublishedFeed(input), [service]);
  const list = useDeckPages(load, 'published', false, `feed:${memberKey(auth)}:${dependencyKey(service)}`);
  const [params, setParams] = useSearchParams();
  const search = params.get('q') || '', category = params.get('kategori') || '';
  const searchId = useId();
  const query = search.trim().toLocaleLowerCase('tr-TR');
  const filtering = !!query || !!category;
  const items = list.items.filter(deck => deck.status === 'published' && (!category || categoryLabel(deck.category) === category) && [deck.title, deck.description, deck.ownerName ?? '', ...(deck.tags ?? [])].some(text => text.toLocaleLowerCase('tr-TR').includes(query)));
  function update(key: string, value: string) {
    // BrowserRouter updates the URL before a concurrent render commits. Keep rapid edits.
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }
  return <section className="vektor-library"><PageIntro title="Sunum Arşivi" description=""><Link to="/yeni" className="btn btn-primary">+ Sunum paylaş</Link></PageIntro>
    <div className="archive-banner"><div><h2>Bir sunum, yeni bir bakış açısı.</h2><p>Aradığın bilgiyi keşfet. Bildiklerini ekibinle paylaş.</p></div><svg viewBox="0 0 160 100" fill="none" aria-hidden="true"><rect x="28" y="14" width="92" height="65" rx="10" transform="rotate(-12 28 14)" stroke="currentColor" opacity=".4"/><rect x="38" y="18" width="92" height="65" rx="10" fill="var(--bg-surface)" stroke="currentColor"/><path d="m75 33 24 18-24 18V33Z" fill="currentColor"/></svg></div>
    <div className="main-content"><div className="vektor-library-search"><label htmlFor={searchId} className="vektor-sr-only">Sunum ara</label><div className="vektor-search-row"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input id={searchId} type="search" className="form-input" value={search} onChange={event => update('q', event.target.value)} placeholder="Başlık, açıklama, etiket veya sunan kişi"/>{search && <button className="btn btn-ghost" onClick={() => update('q', '')}>Temizle</button>}</div></div>
    <div className="category-filters" role="group" aria-label="Kategoriler">{['', ...DECK_CATEGORIES, 'Kategorisiz'].map(value => <button key={value} className="category-filter" aria-pressed={category === value} onClick={() => update('kategori', value)}>{value || 'Tümü'}</button>)}</div>
    {items.length > 0 && <p role="status" aria-atomic="true" className="vektor-list-summary">{items.length} sunum{list.loading ? ' · Sunumlar yükleniyor' : list.hasMore ? ' · Yüklenen sunumlar arasında' : ''}</p>}
    <ListFeedback loading={list.loading} error={list.error} retry={list.refresh} empty={!items.length} emptyText={filtering ? 'Aramanızla eşleşen sunum bulunamadı' : 'Henüz yayınlanmış sunum yok'} emptyDescription={filtering ? list.hasMore ? 'Arşivin kalanındaki sunumları da arayabilir veya filtreleri değiştirebilirsiniz.' : 'Farklı bir kelime deneyin veya filtreleri temizleyin.' : undefined} emptyAction={filtering ? <button className="btn btn-secondary" onClick={() => setParams({})}>Filtreleri temizle</button> : undefined}/>
    <div className="deck-grid">{items.map(deck => <DeckCard key={deck.id} deck={deck}/>)}</div>
    {list.hasMore && <button className="btn btn-secondary vektor-load-more" disabled={list.loading} onClick={filtering ? list.searchAll : list.more}>{list.loading ? 'Yükleniyor…' : filtering ? 'Tüm arşivde ara' : 'Daha fazla göster'}</button>}</div></section>;
}
export function LibraryPage(props: LibraryPageProps) {
  const key = memberKey(props.auth);
  return key ? <LibrarySession key={`${key}:${dependencyKey(props.service)}`} {...props}/> : <LibraryGate auth={props.auth}/>;
}
