/* eslint-disable react-refresh/only-export-components -- Guard provider and its registration hook share a context. */
import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';

const warning = 'Kaydedilmemiş değişiklikleriniz var. Bu sayfadan ayrılırsanız değişiklikler kaybolacak. Ayrılmak istiyor musunuz?';
type Guard = () => boolean;
const GuardContext = createContext<((guard: Guard) => () => void) | null>(null);
/** A derived navigator protects links and navigate() without mutating the router. */
export function NavigationGuard({ children }: { children: ReactNode }) {
  const context = useContext(UNSAFE_NavigationContext);
  const guards = useRef(new Set<Guard>());
  const index = useRef(window.history.state?.idx ?? 0), approvedPop = useRef(false);
  const register = useMemo(() => (guard: Guard) => { guards.current.add(guard); return () => { guards.current.delete(guard); }; }, []);
  const value = useMemo(() => {
    if (!context) return null;
    const confirm = () => ![...guards.current].some(guard => guard()) || window.confirm(warning);
    return { ...context, navigator: { ...context.navigator,
      push: (...args: Parameters<typeof context.navigator.push>) => { if (confirm()) { context.navigator.push(...args); index.current = window.history.state?.idx ?? index.current; } },
      replace: (...args: Parameters<typeof context.navigator.replace>) => { if (confirm()) context.navigator.replace(...args); },
      go: (...args: Parameters<typeof context.navigator.go>) => { if (confirm()) { approvedPop.current = true; context.navigator.go(...args); } },
    } };
  }, [context]);
  useLayoutEffect(() => {
    let restoring = false;
    const pop = (event: PopStateEvent) => {
      const next = event.state?.idx;
      if (restoring) { restoring = false; event.stopImmediatePropagation(); return; }
      if (typeof next !== 'number') return;
      const dirty = [...guards.current].some(guard => guard());
      if (!approvedPop.current && dirty && next !== index.current && !window.confirm(warning)) {
        event.stopImmediatePropagation(); restoring = true; window.history.go(index.current - next); return;
      }
      index.current = next; approvedPop.current = false;
    };
    const unload = (event: BeforeUnloadEvent) => { if ([...guards.current].some(guard => guard())) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('popstate', pop, true); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('popstate', pop, true); window.removeEventListener('beforeunload', unload); };
  }, []);
  return <GuardContext.Provider value={register}>{context ? <UNSAFE_NavigationContext.Provider value={value!}>{children}</UNSAFE_NavigationContext.Provider> : children}</GuardContext.Provider>;
}
export function useUnsavedChanges(dirty: boolean) {
  const register = useContext(GuardContext);
  const dirtyRef = useRef(dirty), bypass = useRef(false);
  useLayoutEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useLayoutEffect(() => register?.(() => dirtyRef.current && !bypass.current), [register]);
  return {
    release: () => { bypass.current = true; },
    request: (action?: () => void) => {
      if (!action || (dirtyRef.current && !window.confirm(warning))) return;
      bypass.current = true; try { action(); } finally { bypass.current = false; }
    },
  };
}
