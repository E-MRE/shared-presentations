import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Deck, DeckStatus } from '../contracts/models';
import './components.css';
export interface DeckCardProps {
  deck: Deck;
  coverUrl?: string;
  actions?: ReactNode;
  showRejectNote?: boolean;
}
const labels: Record<DeckStatus, string> = { pending: 'Onay Bekliyor', published: 'Yayında', rejected: 'Reddedildi', unpublished: 'Yayından Kaldırıldı' };
function Cover({ bytes, url, title }: { bytes: Uint8Array; url?: string; title: string }) {
  const image = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (url || !bytes.byteLength) return;
    const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: bytes[0] === 255 ? 'image/jpeg' : 'image/webp' }));
    if (image.current) image.current.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [bytes, url]);
  return <>{(url || bytes.byteLength > 0) ? <><img ref={image} src={url} alt={`${title} — kapak görseli`} className={failed ? 'vektor-cover-failed' : undefined} aria-hidden={failed || undefined} onLoad={() => setFailed(false)} onError={() => setFailed(true)} loading={failed ? 'eager' : 'lazy'}/>{failed && <span className="vektor-cover-fallback" role="img" aria-label={`${title} — kapak görseli yok`}>{title}</span>}</> : <span className="vektor-cover-fallback" role="img" aria-label={`${title} — kapak görseli yok`}>{title}</span>}</>;
}
export function DeckCard({ deck, coverUrl, actions, showRejectNote = false }: DeckCardProps) {
  const titleId = useId();
  const date = deck.publishedAt ?? deck.createdAt;
  return <article className="deck-card vektor-deck-card" aria-labelledby={titleId}>
    <div className="card-stage vektor-card-cover"><Cover key={coverUrl} bytes={deck.cover} url={coverUrl} title={deck.title}/></div>
    <div className="card-body">
      <div className="card-meta-line"><span>{deck.kind === 'html' ? 'HTML' : 'PPTX'}</span><span className={`card-status-badge status-${deck.status}`}>{labels[deck.status]}</span></div>
      <h2 id={titleId} className="vektor-card-title"><Link to={`/s/${encodeURIComponent(deck.id)}`}>{deck.title}</Link></h2>
      <p className="card-description">{deck.description}</p>
      {showRejectNote && deck.status === 'rejected' && deck.rejectNote && <p className="vektor-reject-note"><strong>Ret notu: </strong>{deck.rejectNote}</p>}
    </div>
    <div className="card-footer"><span className="card-author">{deck.ownerName || 'Ekip üyesi'}</span><time className="card-date" dateTime={date.toISOString()}>{date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}</time></div>
    {actions && <div className="vektor-card-actions">{actions}</div>}
  </article>;
}
