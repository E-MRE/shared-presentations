import { clearDeckPageCache } from './useDeckPages';
import { useRef, useState } from 'react';
import type { Result } from '../../contracts/services';
import { useSessionLifetime } from './session';
import { useToast } from '../../components/toastContext';
/** A synchronous lock rejects duplicate clicks before React paints disabled state. */
export function useDeckMutation(onSuccess: () => void) {
  const alive = useSessionLifetime();
  const lock = useRef(false);
  const toast = useToast();
  const notice = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  function notify(message: string, kind: 'error' | 'success') { notice.current = toast.notify({ message, kind, key: 'deck-mutation' }); }
  async function run(operation: () => Promise<Result<unknown>>, success: string): Promise<boolean> {
    if (!alive() || lock.current) return false;
    lock.current = true; setBusy(true); if (notice.current) toast.dismiss(notice.current);
    try {
      const result = await operation();
      if (!alive()) return false;
      if (!result.ok) { notify('İşlem tamamlanamadı. Yetkinizi ve bağlantınızı kontrol edip yeniden deneyin.', 'error'); return false; }
      clearDeckPageCache(); notify(success, 'success'); onSuccess(); return true;
    } catch { if (alive()) notify('İşlem tamamlanamadı. Bağlantınızı kontrol edip yeniden deneyin.', 'error'); return false; }
    finally { if (alive()) { lock.current = false; setBusy(false); } }
  }
  const reset = () => { if (alive() && !lock.current && notice.current) toast.dismiss(notice.current); };
  return { busy, run, reset };
}
