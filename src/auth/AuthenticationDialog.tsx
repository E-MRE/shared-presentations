import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from '../components';
import { BrandMark } from '../components/BrandMark';
import type { AuthContextValue } from './authContext';
import type { Result } from '../contracts/services';

export type AuthDialogMode = 'login' | 'signup' | 'reset';
export function AuthenticationDialog({ mode, close, change, actions }: { mode: AuthDialogMode; close: () => void; change: (mode: AuthDialogMode) => void; actions: Omit<AuthContextValue, 'state'> }) {
  const email = useRef<HTMLInputElement>(null), lock = useRef(false), alive = useRef(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [showPassword, setShowPassword] = useState(false);
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function run(operation: () => Promise<Result<unknown>>, success: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { const result = await operation(); if (!alive.current) return; if (result.ok) setMessage(success); else setError(result.error.message); }
    catch { if (alive.current) setError('İşlem tamamlanamadı. Yeniden deneyin.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const address = String(data.get('email') ?? '').trim();
    void run(() => mode === 'reset' ? actions.sendPasswordReset(address) : mode === 'signup' ? actions.signUpWithEmail({ email: address, password: String(data.get('password')), displayName: String(data.get('name')) }) : actions.signInWithEmail({ email: address, password: String(data.get('password')) }), mode === 'reset' ? 'Bu adresle bir hesap varsa sıfırlama bağlantısı gönderilecek. Gelen kutunuzu ve spam klasörünüzü kontrol edin.' : 'Oturumunuz hazırlanıyor…');
  }
  const signup = mode === 'signup', reset = mode === 'reset';
  return <Modal open title={signup ? 'Hesap oluştur' : reset ? 'Şifrenizi sıfırlayın' : 'Vektör’e giriş yapın'} description={signup ? 'Bilgini ekiple paylaşmaya bir adım daha yakınsın.' : reset ? 'Hesabına yeniden erişmen için bir bağlantı gönderelim.' : 'Ekibinin fikirlerine kaldığın yerden devam et.'} onClose={() => { if (!busy) close(); }} initialFocus={email}>
    <div className="auth-content"><div className="auth-brand"><BrandMark/><span>Bilgi, paylaştıkça çoğalır.</span></div>
    {!reset && <><button className="btn btn-secondary auth-google" disabled={busy} onClick={() => void run(actions.signInWithGoogle, 'Oturumunuz hazırlanıyor…')}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.2H12v4.2h5.4c-.3 1.4-1 2.4-2.1 3.1V20h3.4c2-1.8 2.9-4.4 2.9-7.8Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.4-2.7c-.9.6-2 .9-3.3.9-2.6 0-4.8-1.8-5.6-4.1H3v2.8C4.7 19.8 8.1 22 12 22Z"/><path fill="#FBBC05" d="M6.4 13.7a6 6 0 0 1 0-3.4V7.5H3a10 10 0 0 0 0 9l3.4-2.8Z"/><path fill="#EA4335" d="M12 6.2c1.5 0 2.9.5 3.9 1.5l2.9-2.9A10 10 0 0 0 3 7.5l3.4 2.8C7.2 8 9.4 6.2 12 6.2Z"/></svg>Google ile giriş yap</button><div className="auth-divider"><span>veya e-posta ile</span></div></>}
    <form onSubmit={submit} className="auth-form">
      {signup && <div className="form-group"><label className="form-label" htmlFor="auth-name">Ad soyad</label><input className="form-input" id="auth-name" name="name" autoComplete="name" placeholder="Nasıl hitap edelim?" required maxLength={100} disabled={busy}/></div>}
      <div className="form-group"><label className="form-label" htmlFor="auth-email">E-posta</label><input ref={email} className="form-input" id="auth-email" name="email" type="email" autoComplete="email" placeholder="ornek@ekibin.com" required disabled={busy}/></div>
      {!reset && <div className="form-group"><div className="auth-label"><label className="form-label" htmlFor="auth-password">Şifre</label>{!signup && <button type="button" className="auth-text-button" disabled={busy} onClick={() => change('reset')}>Şifremi unuttum</button>}</div><div className="auth-password"><input className="form-input" id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} minLength={6} required disabled={busy} aria-describedby={signup ? 'auth-password-hint' : undefined}/><button type="button" className="auth-text-button" aria-pressed={showPassword} aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'} onClick={() => setShowPassword(value => !value)}> {showPassword ? 'Gizle' : 'Göster'}</button></div>{signup && <p className="form-hint" id="auth-password-hint">En az 6 karakter kullanın.</p>}</div>}
      {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}{message && <p className="auth-feedback" role="status">{message}</p>}
      <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>{busy ? 'İşleniyor…' : signup ? 'Hesap oluştur' : reset ? 'Sıfırlama bağlantısı gönder' : 'E-posta ile giriş yap'}</button>
    </form>
    <div className="auth-switch">{mode === 'login' ? <><span>İlk kez mi buradasın?</span><button className="auth-text-button" disabled={busy} onClick={() => change('signup')}>Hesap oluştur</button></> : <button className="auth-text-button" disabled={busy} onClick={() => change('login')}>Girişe dön</button>}</div>
    {signup && <p className="auth-note">E-posta ile kaydolduğunda arşive erişmeden önce adresini doğrulaman gerekir.</p>}</div>
  </Modal>;
}
