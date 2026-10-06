import { useEffect, useRef, type ReactNode } from 'react';

type Illustration = 'empty' | 'mail' | 'success' | 'error' | 'loading';
export function StateIllustration({ kind = 'empty' }: { kind?: Illustration }) {
  const animation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = animation.current;
    if (!node) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) return;
    void Promise.all([import('lottie-web/build/player/lottie_light'), import('../assets/state-motion.json')]).then(([player, data]) => {
      if (cancelled) return;
      const instance = player.default.loadAnimation({ container: node, renderer: 'svg', loop: true, autoplay: true, animationData: data.default });
      const motion = () => media.matches ? instance.pause() : instance.play();
      media.addEventListener('change', motion);
      dispose = () => { media.removeEventListener('change', motion); instance.destroy(); };
    }).catch(() => {});
    return () => { cancelled = true; dispose?.(); };
  }, []);
  return <div className={`state-art state-art-${kind}`} aria-hidden="true">
    <div className="state-motion" ref={animation}/>
    <svg viewBox="0 0 200 148" fill="none"><circle cx="100" cy="74" r="66" fill="var(--brand-primary-subtle)"/><rect x="45" y="29" width="104" height="78" rx="12" transform="rotate(-10 45 29)" fill="var(--bg-surface-raised)" stroke="var(--border-medium)"/><rect x="48" y="33" width="104" height="78" rx="12" transform="rotate(8 48 33)" fill="var(--bg-surface)" stroke="var(--border-medium)"/><rect x="48" y="39" width="104" height="78" rx="12" fill="var(--bg-surface)" stroke="var(--brand-primary)" strokeWidth="2"/>
    {kind === 'mail' ? <path d="m61 58 39 28 39-28M61 60v40h78V60" stroke="var(--brand-primary)" strokeWidth="3" strokeLinejoin="round"/> : <><rect x="63" y="55" width="37" height="27" rx="5" fill="var(--brand-primary-subtle)"/><path d="m75 62 10 7-10 7V62Z" fill="var(--brand-primary)"/><path d="M110 60h26m-26 10h18M64 96h71" stroke="var(--border-strong)" strokeWidth="3" strokeLinecap="round"/></>}
    <circle cx="146" cy="112" r="20" fill={kind === 'error' ? 'var(--status-rejected-bg)' : 'var(--brand-primary)'} stroke="var(--bg-surface)" strokeWidth="5"/>
    {kind === 'success' ? <path d="m137 112 6 6 11-12" stroke="white" strokeWidth="3" strokeLinecap="round"/> : kind === 'error' ? <path d="M146 103v11m0 6v1" stroke="var(--status-rejected)" strokeWidth="3" strokeLinecap="round"/> : <path d="M138 112h16m-8-8v16" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>}</svg>
  </div>;
}
export function StatePanel({ title, description, kind = 'empty', children, heading = 'h2' }: { title: string; description?: string; kind?: Illustration; children?: ReactNode; heading?: 'h1' | 'h2' }) {
  const Heading = heading;
  return <div className="state-panel" role={kind === 'error' ? 'alert' : 'status'}><StateIllustration kind={kind}/><Heading>{title}</Heading>{description && <p>{description}</p>}{children && <div className="state-actions">{children}</div>}</div>;
}
