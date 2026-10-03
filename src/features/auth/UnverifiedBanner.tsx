/**
 * Unverified User Warning Banner
 *
 * Rendered when user is authenticated via email/password but has not yet
 * verified their email address. Blocks uploads and listener subscriptions.
 *
 * References:
 * - docs/PLAN.md §5, §7
 * - docs/BRIEF.md §1, §4
 */

import React, { useState } from 'react';
import { useAuth } from '../../auth';

export const UnverifiedBanner: React.FC = () => {
  const { state, sendVerificationEmail, reloadUser, signOut } = useAuth();
  const [resending, setResending] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (state.status !== 'unverified') {
    return null;
  }

  const handleResend = async () => {
    setResending(true);
    setMessage(null);
    const res = await sendVerificationEmail();
    setResending(false);
    if (res.ok) {
      setMessage('Doğrulama e-postası tekrar gönderildi. Lütfen gelen kutunuzu kontrol edin.');
    } else {
      setMessage(res.error.message);
    }
  };

  const handleCheck = async () => {
    setReloading(true);
    setMessage(null);
    const res = await reloadUser();
    setReloading(false);
    if (res.ok) {
      if (res.value.isMember) {
        setMessage('E-posta adresiniz başarıyla doğrulandı! Üyeliğiniz aktif.');
      } else {
        setMessage('E-posta adresiniz henüz doğrulanmamış görünüyor. Lütfen e-postanızdaki bağlantıya tıklayın.');
      }
    } else {
      setMessage(res.error.message);
    }
  };

  return (
    <aside
      aria-label="E-posta Doğrulama Uyarısı"
      style={{
        background: 'var(--status-pending-bg)',
        borderBottom: '1px solid var(--status-pending-border)',
        padding: '12px 24px',
        color: 'var(--text-primary)',
        fontSize: 'var(--text-xs)',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--max-width-site)',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--status-pending)', fontWeight: 'bold' }}>⚠</span>
          <span>
            <strong>E-posta Doğrulaması Gerekli:</strong> Sunum yükleyebilmek ve kütüphaneye erişebilmek için{' '}
            <strong>{state.user.email}</strong> adresine gönderilen bağlantıyı onaylamanız gerekmektedir.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleResend}
            disabled={resending || reloading}
            style={{ padding: '4px 10px', fontSize: 'var(--text-2xs)' }}
          >
            {resending ? 'Gönderiliyor...' : 'Tekrar Gönder'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCheck}
            disabled={resending || reloading}
            style={{ padding: '4px 10px', fontSize: 'var(--text-2xs)' }}
          >
            {reloading ? 'Kontrol Ediliyor...' : 'Doğrulamayı Kontrol Et'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => signOut()}
            style={{ padding: '4px 10px', fontSize: 'var(--text-2xs)' }}
          >
            Çıkış Yap
          </button>
        </div>
      </div>

      {message && (
        <div
          style={{
            maxWidth: 'var(--max-width-site)',
            margin: '8px auto 0',
            fontSize: 'var(--text-2xs)',
            color: 'var(--text-secondary)',
          }}
        >
          {message}
        </div>
      )}
    </aside>
  );
};
