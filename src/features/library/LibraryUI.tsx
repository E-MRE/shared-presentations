import type { ReactNode } from 'react';
import type { AuthState } from '../../contracts/auth';
import './library.css';
export function LibraryGate({ auth, admin = false }: { auth: AuthState; admin?: boolean }) {
  return <section className="vektor-library empty-state" role="status"><svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h5"/></svg><h1 className="empty-title">{auth.status === 'loading' ? 'Oturum kontrol ediliyor…' : auth.status === 'unverified' ? 'E-posta adresinizi doğrulayın' : admin && auth.status === 'authenticated' ? 'Yönetici erişimi gerekiyor' : 'Ekibin sunumlarını keşfedin'}</h1><p className="empty-desc">{auth.status === 'loading' ? 'Lütfen bekleyin.' : auth.status === 'unverified' ? 'Sunumlara erişmek için e-posta adresinizi doğrulayın.' : admin && auth.status === 'authenticated' ? 'Onay masası yalnızca yöneticilere açıktır.' : 'Sunum arşivine erişmek için giriş yapın.'}</p></section>;
}
export function PageIntro({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <header className="page-intro"><div className="intro-container vektor-library-intro"><div className="intro-heading-group"><h1 className="intro-title">{title}</h1><p className="intro-desc">{description}</p></div>{children}</div></header>;
}
export function ListFeedback({ loading, error, retry, empty, emptyText }: { loading: boolean; error: string; retry: () => void; empty: boolean; emptyText: string }) {
  return <>{loading && <p role="status" className="vektor-list-message">Sunumlar yükleniyor…</p>}{error && <div role="alert" className="vektor-list-message"><p>{error}</p><button className="btn btn-secondary" onClick={retry}>Yeniden dene</button></div>}{!loading && !error && empty && <div className="empty-state" role="status"><h2 className="empty-title">{emptyText}</h2><p className="empty-desc">Yeni sunumlar eklendiğinde burada görünecek.</p></div>}</>;
}
