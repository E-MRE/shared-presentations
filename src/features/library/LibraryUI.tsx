import type { ReactNode } from 'react';
import type { AuthState } from '../../contracts/auth';
import './library.css';
import { StatePanel } from '../../components/StatePanel';
export function LibraryGate({ auth, admin = false }: { auth: AuthState; admin?: boolean }) {
  return <section className="vektor-library empty-state" role="status"><svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h5"/></svg><h1 className="empty-title">{auth.status === 'loading' ? 'Oturum kontrol ediliyor…' : auth.status === 'unverified' ? 'E-posta adresinizi doğrulayın' : admin && auth.status === 'authenticated' ? 'Yönetici erişimi gerekiyor' : 'Ekibin sunumlarını keşfedin'}</h1><p className="empty-desc">{auth.status === 'loading' ? 'Lütfen bekleyin.' : auth.status === 'unverified' ? 'Sunumlara erişmek için e-posta adresinizi doğrulayın.' : admin && auth.status === 'authenticated' ? 'Onay masası yalnızca yöneticilere açıktır.' : 'Sunum arşivine erişmek için giriş yapın.'}</p></section>;
}
export function PageIntro({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <header className="page-intro"><div className="intro-container vektor-library-intro"><div className="intro-heading-group"><h1 className="intro-title">{title}</h1><p className="intro-desc">{description}</p></div>{children}</div></header>;
}
export function ListFeedback({ loading, error, retry, empty, emptyText, emptyDescription, emptyAction }: { loading: boolean; error: string; retry: () => void; empty: boolean; emptyText: string; emptyDescription?: string; emptyAction?: ReactNode }) {
  return <>{loading && <div className="list-loading" role="status"><span className="vektor-sr-only">Sunumlar yükleniyor…</span><div className="skeleton-grid" aria-hidden="true">{[0, 1, 2].map(index => <div className="skeleton-card" key={index}><div/><span/><span/><span/></div>)}</div></div>}{error && <StatePanel title="Sunumlar yüklenemedi" description={error} kind="error"><button className="btn btn-secondary" onClick={retry}>Yeniden dene</button></StatePanel>}{!loading && !error && empty && <StatePanel title={emptyText} description={emptyDescription || 'Yeni bir sunum paylaşarak ekibin bilgi arşivine katkıda bulunabilirsiniz.'}>{emptyAction}</StatePanel>}</>;
}
