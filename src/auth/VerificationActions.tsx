import { useEffect, useState } from 'react';
export function VerificationActions({ busy, retryAt = 0, resend, reload }: { busy: boolean; retryAt?: number; resend: () => void; reload: () => void }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  return <><div className="welcome-actions"><button className="btn btn-primary" disabled={busy || remaining > 0} onClick={resend}>Doğrulama e-postasını yeniden gönder</button><button className="btn btn-secondary" disabled={busy} onClick={reload}>Doğruladım, yeniden kontrol et</button></div>{remaining > 0 && <p className="form-hint">Yeni gönderim için {remaining} saniye bekleyin.</p>}</>;
}
