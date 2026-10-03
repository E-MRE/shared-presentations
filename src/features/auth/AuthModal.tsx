/**
 * AuthModal Component
 *
 * Real Firebase authentication dialog supporting Google OAuth,
 * email/password sign-in and sign-up with email verification notice.
 *
 * References:
 * - docs/PLAN.md §5
 * - docs/BRIEF.md §1, §4
 * - design/index.html
 */

import React, { useState } from 'react';
import { useAuth } from '../../auth';
import { PasswordResetModal } from './PasswordResetModal';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signin',
}) => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    const res = await signInWithGoogle();
    setLoading(false);
    if (res.ok) {
      onClose();
    } else {
      setError(res.error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (mode === 'signin') {
      const res = await signInWithEmail({ email, password });
      setLoading(false);
      if (res.ok) {
        onClose();
      } else {
        setError(res.error.message);
      }
    } else {
      const res = await signUpWithEmail({ email, password, displayName });
      setLoading(false);
      if (res.ok) {
        setSignupSuccess(true);
      } else {
        setError(res.error.message);
      }
    }
  };

  const handleClose = () => {
    setError(null);
    setSignupSuccess(false);
    onClose();
  };

  return (
    <>
      <div
        className="modal-overlay active"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <div className="modal-box" style={{ maxWidth: '480px' }}>
          <div className="modal-header">
            <div className="modal-title-group">
              <h2 className="modal-title" id="auth-modal-title">
                {mode === 'signin' ? 'Ekip Girişi' : 'Hesap Oluştur'}
              </h2>
              <span className="modal-subtitle">
                {mode === 'signin'
                  ? 'Sunum kütüphanesine erişmek için giriş yapın.'
                  : 'Vektör sunum kütüphanesine katılmak için kayıt olun.'}
              </span>
            </div>
            <button
              type="button"
              className="modal-close"
              onClick={handleClose}
              aria-label="Pencereyi Kapat"
            >
              ✕
            </button>
          </div>

          <div className="modal-body">
            {signupSuccess ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ color: 'var(--primitive-emerald-400)', marginBottom: '8px', fontSize: 'var(--text-lg)' }}>
                  ✓ Kayıt Başarılı!
                </div>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  <strong>{email}</strong> adresinize bir doğrulama bağlantısı gönderildi. Sunum yükleyebilmek için lütfen gelen kutunuzu kontrol edip e-posta adresinizi onaylayın.
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleClose}
                  style={{ width: '100%' }}
                >
                  Anladım, Devam Et
                </button>
              </div>
            ) : (
              <>
                {/* Google Sign-In */}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    gap: '10px',
                    padding: '10px 16px',
                    marginBottom: '16px',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"
                    />
                    <path
                      fill="#34A853"
                      d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.347 2.825.957 4.039l3.007-2.332z"
                    />
                    <path
                      fill="#EA4335"
                      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"
                    />
                  </svg>
                  <span>Google ile Devam Et</span>
                </button>

                {/* Divider */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    margin: '16px 0',
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                  <span>veya e-posta ile</span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                </div>

                {/* Mode Selector Tabs */}
                <div
                  style={{
                    display: 'flex',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '2px',
                    marginBottom: '16px',
                  }}
                >
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 'var(--font-medium)',
                      color: mode === 'signin' ? 'var(--text-primary)' : 'var(--text-secondary)',
                      background: mode === 'signin' ? 'var(--bg-surface-raised)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all var(--duration-fast)',
                    }}
                    onClick={() => {
                      setMode('signin');
                      setError(null);
                    }}
                  >
                    Giriş Yap
                  </button>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 'var(--font-medium)',
                      color: mode === 'signup' ? 'var(--text-primary)' : 'var(--text-secondary)',
                      background: mode === 'signup' ? 'var(--bg-surface-raised)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all var(--duration-fast)',
                    }}
                    onClick={() => {
                      setMode('signup');
                      setError(null);
                    }}
                  >
                    Kayıt Ol
                  </button>
                </div>

                {/* Error Banner */}
                {error && (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--status-rejected-bg)',
                      border: '1px solid var(--status-rejected-border)',
                      color: 'var(--status-rejected)',
                      fontSize: 'var(--text-xs)',
                      marginBottom: '16px',
                    }}
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {mode === 'signup' && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="auth-name">
                        Ad Soyad <span className="req">*</span>
                      </label>
                      <input
                        id="auth-name"
                        type="text"
                        className="form-input"
                        placeholder="Örn: Ayşe Yılmaz"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        disabled={loading}
                        required
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label" htmlFor="auth-email">
                      E-posta Adresi <span className="req">*</span>
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      className="form-input"
                      placeholder="ornek@sirket.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="auth-password">
                      Şifre <span className="req">*</span>
                      {mode === 'signin' && (
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'var(--primitive-blue-400)',
                            fontSize: 'var(--text-2xs)',
                            cursor: 'pointer',
                          }}
                          onClick={() => setResetModalOpen(true)}
                        >
                          Şifremi Unuttum
                        </button>
                      )}
                    </label>
                    <input
                      id="auth-password"
                      type="password"
                      className="form-input"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      required
                      minLength={6}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                    style={{ marginTop: '6px', width: '100%', justifyContent: 'center' }}
                  >
                    {loading
                      ? 'İşleniyor...'
                      : mode === 'signin'
                      ? 'Giriş Yap'
                      : 'Hesap Oluştur'}
                  </button>
                </form>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={loading}
            >
              Vazgeç
            </button>
          </div>
        </div>
      </div>

      <PasswordResetModal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
      />
    </>
  );
};
