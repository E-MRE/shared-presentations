import { useId, type ReactNode } from 'react';
import { Header, type HeaderProps } from './Header';
export interface AppLayoutProps extends HeaderProps {
  children: ReactNode;
  footer?: ReactNode;
}
export function AppLayout({ children, footer, ...header }: AppLayoutProps) {
  const mainId = useId();
  return <div className="vektor-layout">
    <a className="vektor-skip-link" href={`#${mainId}`} onClick={() => document.getElementById(mainId)?.focus()}>Ana içeriğe geç</a>
    <Header {...header}/>
    <main id={mainId} tabIndex={-1} className="vektor-main">{children}</main>
    <footer className="site-footer"><div className="footer-container">{footer ?? <span className="footer-meta">Vektör · Ekip sunum arşivi</span>}</div></footer>
  </div>;
}
