import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export function RouteScroll() {
  const location = useLocation(), previous = useRef(location.pathname);
  useLayoutEffect(() => {
    if (previous.current === location.pathname) return;
    previous.current = location.pathname;
    const requested = location.state?.restoreScroll;
    const target = typeof requested === 'number' && Number.isFinite(requested) ? Math.max(0, requested) : 0;
    let frame = 0, ticks = 0;
    function restore() {
      window.scrollTo({ top: target, behavior: 'instant' });
      if (target && document.documentElement.scrollHeight - window.innerHeight < target && ticks++ < 120) frame = requestAnimationFrame(restore);
    }
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, location.state]);
  return null;
}
