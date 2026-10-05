import { useRef, useState } from 'react';
import type { Result } from '../../contracts/services';
import { useSessionLifetime } from './session';
/** A synchronous lock rejects duplicate clicks before React paints disabled state. */
export function useDeckMutation(onSuccess: () => void) {
  const alive = useSessionLifetime();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function run(operation: () => Promise<Result<unknown>>, success: string): Promise<boolean> {
    if (!alive() || lock.current) return false;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await operation();
      if (!alive()) return false;
      if (!result.ok) { setError('İşlem tamamlanamadı. Yetkinizi ve bağlantınızı kontrol edip yeniden deneyin.'); return false; }
      setMessage(success); onSuccess(); return true;
    } catch { if (alive()) setError('İşlem tamamlanamadı. Bağlantınızı kontrol edip yeniden deneyin.'); return false; }
    finally { if (alive()) { lock.current = false; setBusy(false); } }
  }
  const reset = () => { if (alive() && !lock.current) { setError(''); setMessage(''); } };
  return { busy, error, message, run, reset };
}
