import { useEffect, useRef } from 'react';

export function useMenuDismiss() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const outside = (event: PointerEvent) => { if (!node.contains(event.target as Node)) node.open = false; };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && node.open) { event.stopPropagation(); node.open = false; node.querySelector('summary')?.focus(); } };
    document.addEventListener('pointerdown', outside); node.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', outside); node.removeEventListener('keydown', key); };
  }, []);
  return ref;
}
