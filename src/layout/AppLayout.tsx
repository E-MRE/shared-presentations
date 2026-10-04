import { useId, type ReactNode } from 'react';
import { Header, type HeaderProps } from './Header';
export interface AppLayoutProps extends HeaderProps {
  children: ReactNode;
  footer?: ReactNode;
}
export function AppLayout({ children, footer, ...header }: AppLayoutProps) {
  const mainId = useId();
  return <div className="vektor-layout">
    <a className="vektor-skip-link" href={`#${mainId}`} onClick={event => {
      event.preventDefault();
      const main = document.getElementById(mainId);
      if (!main) return;
      const banner = main.parentElement?.querySelector('header');
      const position = banner ? getComputedStyle(banner).position : 'static';
      const offset = banner && (position === 'sticky' || position === 'fixed') ? banner.getBoundingClientRect().height : 0;
      main.style.setProperty('--vektor-header-height', `${offset}px`);
      main.focus({ preventScroll: true });
      main.scrollIntoView({ block: 'start', behavior: 'instant' });
    }}>Ana içeriğe geç</a>
    <Header {...header}/>
    <main id={mainId} tabIndex={-1} className="vektor-main">{children}</main>
    <footer className="site-footer"><div className="footer-container">{footer ?? <span className="footer-meta">Vektör · Ekip sunum arşivi</span>}</div></footer>
  </div>;
}
