import { createContext, useContext } from 'react';
export type ToastKind = 'success' | 'info' | 'error';
export interface ToastInput { message: string; kind?: ToastKind; duration?: number; key?: string; }
export interface ToastAPI { notify: (toast: ToastInput) => string; dismiss: (id: string) => void; }
export const ToastContext = createContext<ToastAPI | null>(null);
// Native modal dialogs occupy the top layer. Their notifications must live there too.
export const ToastHostContext = createContext<(host: HTMLDivElement | null) => void>(() => {});
export function useToast(): ToastAPI {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast requires ToastProvider');
  return api;
}
