import { NavLink, Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { AuthState } from '../contracts/auth';
import './layout.css';
export interface HeaderProps {
  auth: AuthState;
  onSignIn: () => void;
  onSignOut: () => void;
  pendingCount?: number;
  actions?: ReactNode;
}
export function Header({ auth, onSignIn, onSignOut, pendingCount = 0, actions }: HeaderProps) {
  const member = auth.status === 'authenticated' && auth.isMember;
  const admin = member && auth.isAdmin;
  const count = Math.max(0, Math.floor(Number.isFinite(pendingCount) ? pendingCount : 0));
  return <header className="site-header vektor-header">
    <div className="header-container">
      <Link to="/" className="brand" aria-label="Vektör ana sayfa"><span className="brand-title">Vektör</span></Link>
      {member && <nav className="vektor-navigation" aria-label="Ana gezinme">
        <NavLink to="/" end className="btn btn-ghost">Sunum Arşivi</NavLink>
        <NavLink to="/benim" className="btn btn-ghost">Benim Sunumlarım</NavLink>
        <NavLink to="/yeni" className="btn btn-secondary">Yeni Sunum</NavLink>
        {admin && <NavLink to="/admin" className="btn btn-ghost">Onay Masası <span className="card-status-badge status-pending" aria-hidden="true">{count}</span></NavLink>}
      </nav>}
      <div className="header-actions">
        {actions}
        {auth.status === 'loading' ? <span role="status">Oturum yükleniyor…</span> : auth.user ? <>
          <span className="vektor-user" title={auth.user.displayName || auth.user.email}>{auth.user.displayName || auth.user.email}</span>
          <button type="button" className="btn btn-ghost" onClick={onSignOut}>Çıkış Yap</button>
        </> : <button type="button" className="btn btn-secondary" onClick={onSignIn}>Giriş Yap</button>}
      </div>
      {admin && <span className="vektor-sr-only" role="status" aria-live="polite" aria-atomic="true">Onay bekleyen {count} sunum var.</span>}
    </div>
  </header>;
}
