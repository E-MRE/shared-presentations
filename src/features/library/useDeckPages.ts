import { useCallback, useEffect, useRef, useState } from 'react';
import type { Deck } from '../../contracts/models';
import type { PaginatedQueryInput, PaginatedResult, Result } from '../../contracts/services';
import { useSessionLifetime } from './session';
export type DeckPageLoader = (input: PaginatedQueryInput) => Promise<Result<PaginatedResult<Deck>>>;
export type DeckOrder = 'published' | 'updated' | 'oldest';
type PageState = { items: Deck[]; loading: boolean; error: string; page: PaginatedResult<Deck> | null };
const cache = new Map<string, PageState>();
export function clearDeckPageCache() { cache.clear(); }
export function mergeDecks(previous: Deck[], incoming: Deck[], order: DeckOrder): Deck[] {
  const map = new Map(previous.map(deck => [deck.id, deck]));
  incoming.forEach(deck => map.set(deck.id, deck));
  const date = (deck: Deck) => (order === 'published' ? deck.publishedAt : order === 'updated' ? deck.updatedAt : deck.createdAt)?.getTime() ?? 0;
  // Stable ties retain query order, including Firestore precision lost by Deck.Date.
  return [...map.values()].sort((a, b) => (order === 'oldest' ? date(a) - date(b) : date(b) - date(a)));
}
/** Metadata only. Feed mode drains every cursor once; search is derived in render. */
export function useDeckPages(load: DeckPageLoader, order: DeckOrder, drain = false, cacheKey?: string) {
  const alive = useSessionLifetime();
  const generation = useRef(0);
  const locked = useRef(false);
  const [state, setState] = useState<PageState>(() => (cacheKey && cache.get(cacheKey)) || { items: [], loading: true, error: '', page: null });
  useEffect(() => { if (cacheKey && state.page && !state.loading && !state.error) { if (cache.size > 20) cache.clear(); cache.set(cacheKey, state); } }, [cacheKey, state]);
  const fetch = useCallback(async (append: boolean, cursor?: PaginatedQueryInput['cursor'], exhaustive = drain) => {
    if (!alive() || (append && locked.current)) return;
    const token = append ? generation.current : ++generation.current;
    locked.current = true;
    setState(previous => ({ ...previous, items: append ? previous.items : [], page: append ? previous.page : null, loading: true, error: '' }));
    const visited = new Set<string>(cursor ? [cursor.docId] : []);
    try {
      do {
        const result = await load({ pageSize: 12, ...(cursor ? { cursor } : {}) });
        if (!alive() || generation.current !== token) return;
        if (!result.ok) throw new Error(result.error.message);
        const page = result.value;
        setState(previous => ({ ...previous, items: mergeDecks(previous.items, page.items, order), page }));
        if (page.hasMore && (!page.nextCursor || page.nextCursor.docId === cursor?.docId)) throw new Error('Sunum listesi tamamlanamadı. Yeniden deneyin.');
        if (!exhaustive || !page.hasMore) break;
        if (!page.nextCursor || visited.has(page.nextCursor.docId)) throw new Error('Sunum listesi tamamlanamadı. Yeniden deneyin.');
        visited.add(page.nextCursor.docId);
        cursor = page.nextCursor;
      } while (alive());
    } catch {
      if (alive() && generation.current === token) setState(previous => ({ ...previous, error: 'Sunumlar yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.' }));
    } finally {
      if (alive() && generation.current === token) { locked.current = false; setState(previous => ({ ...previous, loading: false })); }
    }
  }, [alive, drain, load, order]);
  useEffect(() => { if (!cacheKey || !cache.has(cacheKey)) void fetch(false); }, [cacheKey, fetch]);
  const refresh = useCallback(() => { void fetch(false); }, [fetch]);
  const more = () => { if (state.page?.hasMore && state.page.nextCursor) void fetch(true, state.page.nextCursor); };
  const searchAll = () => { if (state.page?.hasMore && state.page.nextCursor) void fetch(true, state.page.nextCursor, true); };
  return { ...state, refresh, more, searchAll, hasMore: state.page?.hasMore ?? false };
}
