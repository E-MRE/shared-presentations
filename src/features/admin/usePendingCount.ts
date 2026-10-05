import { useLayoutEffect, useState } from 'react';
import type { AuthState } from '../../contracts/auth';
import { dependencyKey, memberKey } from '../library/session';
import type { AdminReadAdapter } from './adapter';
export interface PendingCountState { count: number | null; loading: boolean; error: string; retry: () => void; }
/** Supply this count to Header.pendingCount; mount only one contextual live badge. */
export function usePendingCount(auth: AuthState, adapter: AdminReadAdapter): PendingCountState {
  const member = memberKey(auth);
  const [retryVersion, setRetryVersion] = useState(0);
  const key = member && auth.isAdmin ? `${member}:${dependencyKey(adapter)}:${retryVersion}` : null;
  const [state, setState] = useState<{ key: string; count: number | null; error: string } | null>(null);
  useLayoutEffect(() => {
    if (!key) return;
    let active = true;
    let unsubscribe = () => {};
    try {
      unsubscribe = adapter.subscribePendingCount(count => {
        if (active) setState({ key, count, error: '' });
      }, () => {
        if (active) setState({ key, count: null, error: 'Bekleyen sunum sayısı alınamadı. Yeniden deneyin.' });
      });
    } catch { queueMicrotask(() => { if (active) setState({ key, count: null, error: 'Bekleyen sunum sayısı alınamadı. Yeniden deneyin.' }); }); }
    return () => { active = false; unsubscribe(); };
  }, [adapter, key]);
  const current = state?.key === key ? state : null;
  return { count: key ? current?.count ?? null : null, loading: !!key && !current, error: key ? current?.error ?? '' : '', retry: () => setRetryVersion(value => value + 1) };
}
