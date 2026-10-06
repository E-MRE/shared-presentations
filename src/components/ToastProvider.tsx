import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ToastContext, ToastHostContext, type ToastInput, type ToastKind } from './toastContext';
import './components.css';
interface ToastMessage { id: string; message: string; kind: ToastKind; duration: number; key?: string; }
const labels: Record<ToastKind, string> = { success: 'Başarılı', info: 'Bilgi', error: 'Hata' };
function ToastItem({ toast, dismiss }: { toast: ToastMessage; dismiss: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(toast.duration);
  useEffect(() => {
    if (toast.duration <= 0 || hovered || focused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => dismiss(toast.id), remaining.current);
    return () => { window.clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - started)); };
  }, [toast, hovered, focused, dismiss]);
  return <div className={`toast ${toast.kind === 'error' ? 'danger' : toast.kind} vektor-toast`} data-toast-id={toast.id} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <span className="toast-dot" aria-hidden="true"/>
    <span role={toast.kind === 'error' ? 'alert' : 'status'} aria-atomic="true"><strong>{labels[toast.kind]}: </strong><span>{toast.message}</span></span>
    <button type="button" className="btn btn-ghost" aria-label={`${labels[toast.kind]} bildirimini kapat`} onClick={() => dismiss(toast.id)}>Kapat</button>
  </div>;
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const sequence = useRef(0);
  const notify = useCallback((input: ToastInput) => {
    const id = `vektor-toast-${++sequence.current}`;
    const kind = input.kind ?? 'info';
    setToasts(previous => [...previous.filter(toast => !input.key || toast.key !== input.key), { id, kind, message: input.message, key: input.key, duration: input.duration ?? (kind === 'error' ? 8000 : 4000) }]);
    return id;
  }, []);
  const dismiss = useCallback((id: string) => setToasts(previous => previous.filter(toast => toast.id !== id)), []);
  const api = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);
  return <ToastContext.Provider value={api}><ToastHostContext.Provider value={setHost}>{children}{createPortal(<div className="toast-container vektor-toasts" aria-label="Bildirimler">{toasts.map(toast => <ToastItem key={toast.id} toast={toast} dismiss={dismiss}/>)}</div>, host ?? document.body)}</ToastHostContext.Provider></ToastContext.Provider>;
}
