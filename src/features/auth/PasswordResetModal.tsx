/**
 * Password Reset Modal Component
 *
 * References:
 * - docs/PLAN.md §5
 * - docs/BRIEF.md §1
 */

import React, { useState } from 'react';
import { useAuth } from '../../auth';

export interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PasswordResetModal: React.FC<PasswordResetModalProps> = ({ isOpen, onClose }) => {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Lütfen e-posta adresinizi giriniz.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await sendPasswordReset(email.trim());
    setLoading(false);

    if (res.ok) {
      setSuccess(true);
    } else {
      setError(res.error.message);
    }
  };

  const handleClose = () => {
    setEmail('');
    setError(null);
    setSuccess(false);
    onClose();
  };

  return (
    <div
      className="modal-overlay active"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-reset-modal-title"
    >
      <div className="modal-box" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <div className="modal-title-group">
            <h2 className="modal-title" id="password-reset-modal-title">
              Şifre Sıfırlama
            </h2>
            <span className="modal-subtitle">
              Hesabınıza ait e-posta adresinizi girin, sıfırlama bağlantısı gönderelim.
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
          {success ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ color: 'var(--primitive-emerald-400)', marginBottom: '8px', fontSize: 'var(--text-lg)' }}>
                ✓ Sıfırlama Bağlantısı Gönderildi
              </div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                <strong>{email}</strong> adresine şifre sıfırlama talimatları gönderildi. Lütfen gelen kutunuzu kontrol edin.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {error && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--status-rejected-bg)',
                    border: '1px solid var(--status-rejected-border)',
                    color: 'var(--status-rejected)',
                    fontSize: 'var(--text-xs)',
                  }}
                  role="alert"
                >
                  {error}
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="reset-email">
                  E-posta Adresi <span className="req">*</span>
                </label>
                <input
                  id="reset-email"
                  type="email"
                  className="form-input"
                  placeholder="ornek@sirket.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClose}
                  disabled={loading}
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Gönderiliyor...' : 'Bağlantı Gönder'}
                </button>
              </div>
            </form>
          )}
        </div>

        {success && (
          <div className="modal-footer">
            <button type="button" className="btn btn-primary" onClick={handleClose} style={{ width: '100%' }}>
              Tamam
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
