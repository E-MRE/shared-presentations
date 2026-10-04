import { useEffect, useEffectEvent, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import './components.css';
export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  description?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
}
/** One active dialog at a time. Consumers serialize dialog requests. */
export function Modal({ open, title, onClose, children, footer, description, initialFocus, closeOnBackdrop = false }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const node = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    node.showModal();
    document.body.style.overflow = 'hidden';
    if (initialFocus?.current && node.contains(initialFocus.current)) initialFocus.current.focus();
    const cancel = (event: Event) => { event.preventDefault(); close(); };
    node.addEventListener('cancel', cancel);
    return () => {
      node.removeEventListener('cancel', cancel);
      node.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open, initialFocus]);
  if (!open) return null;
  return createPortal(<dialog ref={dialog} className="modal-box vektor-modal" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} aria-modal="true" onClick={event => {
    if (!closeOnBackdrop || event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
  }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')).filter(node => node.tabIndex >= 0 && !node.matches(':disabled, [inert], [hidden]') && node.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first) { event.preventDefault(); event.currentTarget.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <div className="modal-header"><div className="modal-title-group"><h2 className="modal-title" id={titleId}>{title}</h2>{description && <p className="modal-subtitle" id={descriptionId}>{description}</p>}</div>
      <button type="button" className="modal-close" aria-label="Pencereyi kapat" onClick={onClose}><svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
    <div className="modal-body">{children}</div>
    {footer && <div className="modal-footer">{footer}</div>}
  </dialog>, document.body);
}
