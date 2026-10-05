import type { AuthState } from '../../contracts/auth';
import type { AdminReadAdapter } from './adapter';
import { usePendingCount } from './usePendingCount';
import './admin.css';
export interface PendingBadgeProps { auth: AuthState; adapter: AdminReadAdapter; }
export function PendingBadge({ auth, adapter }: PendingBadgeProps) {
  const state = usePendingCount(auth, adapter);
  if (auth.status !== 'authenticated' || !auth.isMember || !auth.isAdmin) return null;
  return <div className="vektor-pending-badge"><span role="status" aria-atomic="true">{state.error || (state.loading ? 'Bekleyen sunum sayısı yükleniyor…' : `${state.count} sunum onay bekliyor`)}</span>{state.error && <button className="btn btn-ghost" onClick={state.retry}>Sayımı yeniden dene</button>}</div>;
}
