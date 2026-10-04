import { createContext, useContext } from 'react';
export type ToastKind = 'success' | 'info' | 'error';
export interface ToastInput { message: string; kind?: ToastKind; duration?: number; }
export interface ToastAPI { notify: (toast: ToastInput) => string; dismiss: (id: string) => void; }
export const ToastContext = createContext<ToastAPI | null>(null);
export function useToast(): ToastAPI {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast requires ToastProvider');
  return api;
}
