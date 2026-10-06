import { Link, useLocation, type LinkProps } from 'react-router-dom';

export function PresentationLink({ id, children, ...props }: Omit<LinkProps, 'to'> & { id: string }) {
  const location = useLocation();
  return <Link {...props} to={`/s/${encodeURIComponent(id)}`} state={{ returnTo: location.pathname + location.search }} onClick={event => {
    try { sessionStorage.setItem('vektor-return-scroll', String(window.scrollY)); } catch { /* Storage may be disabled; the return route still works. */ }
    props.onClick?.(event);
  }}>{children}</Link>;
}
