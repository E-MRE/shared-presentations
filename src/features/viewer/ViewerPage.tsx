import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { StatePanel } from '../../components/StatePanel';
import { categoryLabel } from '../../contracts/catalog';
import type { AuthState } from '../../contracts/auth';
import type { Deck } from '../../contracts/models';
import type { PresentationDataService } from '../../contracts/services';
import { AppErrorCode, type AppError } from '../../contracts/errors';
import { MAX_COVER_BYTES } from '../../contracts/limits';
import { reconstructPresentation } from '../../content/chunks';
import { PPTX_MIME, safeDownloadName, safeResourceUrl, validContentMetadata } from './validation';
import './viewer.css';

export type ViewerReadService = Pick<PresentationDataService, 'getDeck' | 'getAllChunks'>;
export interface PresentationViewerProps {
  id?: string;
  auth: AuthState;
  service: ViewerReadService;
  /** Close the route; the integrating app controls its internal return destination. */
  onClose: () => void;
}
export type ViewerPageProps = Omit<PresentationViewerProps, 'id' | 'onClose'> & { onClose?: () => void };

/** Router adapter for /s/:id. Direct links safely close to the internal archive. */
export function ViewerPage({ auth, service, onClose }: ViewerPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const origin = location.state?.returnTo;
  let returnScroll = 0;
  try { returnScroll = Number(sessionStorage.getItem('vektor-return-scroll') || 0); } catch { /* Optional scroll memory. */ }
  const returnTo = typeof origin === 'string' && /^(\/|\/benim|\/admin)(\?[^#]*)?$/.test(origin) ? origin : '/';
  return <PresentationViewer id={id} auth={auth} service={service} onClose={onClose ?? (() => navigate(returnTo, { replace: true, state: { restoreScroll: returnScroll } }))} />;
}

const serviceKeys = new WeakMap<ViewerReadService, number>();
let nextServiceKey = 0;
function serviceKey(service: ViewerReadService) {
  if (!serviceKeys.has(service)) serviceKeys.set(service, ++nextServiceKey);
  return serviceKeys.get(service);
}

/** Read-only viewer; no Firebase singleton, fake authentication, or implicit reads. */
export function PresentationViewer({ id, auth, service, onClose }: PresentationViewerProps) {
  if (auth.status !== 'authenticated' || !auth.isMember || !auth.user.isMember) {
    const message = auth.status === 'loading' ? 'Oturum kontrol ediliyor…' : auth.status === 'unverified'
      ? 'Sunumu görmek için e-posta adresinizi doğrulayın.' : 'Sunumu görmek için giriş yapın.';
    return <Gate message={message} onClose={onClose} />;
  }
  if (!id || id.includes('/')) return <Gate message="Geçerli bir sunum kimliği bulunamadı." onClose={onClose} error />;
  // A new route, identity, role or service gets a new lifetime. Old content is hidden in this render.
  return <ViewerSession key={JSON.stringify([id, auth.user.uid, auth.isAdmin, serviceKey(service)])}
    id={id} uid={auth.user.uid} isAdmin={auth.isAdmin} service={service} onClose={onClose} />;
}

function Icon({ type }: { type: 'close' | 'fullscreen' | 'info' | 'download' | 'file' }) {
  const paths = { close: 'm6 6 12 12M6 18 18 6', fullscreen: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5', info: 'M12 11v6m0-10v.01', download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4', file: 'M14 2H5v20h14V7Zm0 0v5h5M8 12h8M8 16h8' };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type]} />{type === 'info' && <circle cx="12" cy="12" r="9" />}</svg>;
}

function Gate({ message, onClose, error = false }: { message: string; onClose: () => void; error?: boolean }) {
  return <main className="vektor-viewer viewer-gate" aria-label="Sunum görüntüleyici"><button className="viewer-button" onClick={onClose}><Icon type="close" />Kapat</button><div className="viewer-notice" role={error ? 'alert' : 'status'}><Icon type="file" /><h1>{message}</h1></div></main>;
}

function Metadata({ deck }: { deck: Deck }) {
  const links = deck.links.map(link => ({ ...link, href: safeResourceUrl(link.url) })).filter(link => link.href);
  return <div className="viewer-metadata">
    <p className="viewer-eyebrow">SUNUM HAKKINDA</p><h2>{deck.title}</h2><p className="viewer-author">{deck.ownerName || 'İsimsiz üye'}</p>
    <p className="viewer-description">{deck.description || 'Bu sunum için açıklama eklenmemiş.'}</p>
    <p className="card-category">{categoryLabel(deck.category)}</p>{!!deck.tags?.length && <div className="card-tags">{deck.tags.map(tag => <span className="card-tag" key={tag}>#{tag}</span>)}</div>}
    {links.length > 0 && <section aria-label="Kaynak bağlantıları"><h3>Kaynaklar</h3><ul>{links.map((link, index) => <li key={index}><a href={link.href!} target="_blank" rel="noopener noreferrer">{link.label || link.href}<span aria-hidden="true"> ↗</span><span className="viewer-sr"> (yeni sekmede açılır)</span></a></li>)}</ul></section>}
    <dl><div><dt>Dosya</dt><dd>{deck.fileName}</dd></div><div><dt>Biçim</dt><dd>{deck.kind === 'html' ? 'HTML' : 'PowerPoint · PPTX'}</dd></div><div><dt>Dosya boyutu</dt><dd>{new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(deck.sizes.encoded / 1024 / 1024)} MB</dd></div><div><dt>Güncellendi</dt><dd>{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(deck.updatedAt)}</dd></div></dl>
  </div>;
}

function Cover({ deck }: { deck: Deck }) {
  const image = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  const data = deck.cover;
  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const webp = data.length >= 12 && String.fromCharCode(...data.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...data.subarray(8, 12)) === 'WEBP';
  const valid = data.length > 0 && data.length <= MAX_COVER_BYTES && (jpeg || webp);
  useEffect(() => {
    if (!valid) return;
    const value = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: jpeg ? 'image/jpeg' : 'image/webp' }));
    if (image.current) image.current.src = value;
    return () => URL.revokeObjectURL(value);
  }, [data, jpeg, valid]);
  return <div className="viewer-cover">{valid && <img ref={image} alt={`${deck.title} kapak görseli`} hidden={failed} aria-hidden={failed || undefined} onLoad={() => setFailed(false)} onError={() => setFailed(true)} />}{(!valid || failed) && <div role="img" aria-label={`${deck.title} — kapak görseli yok`}><span className="viewer-cover-brand">VEKTÖR / PPTX</span><Icon type="file" /><p>{deck.title}</p><span>{deck.ownerName || 'İsimsiz üye'}</span></div>}</div>;
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; deck: Deck; html?: string };
function errorText(error: AppError) {
  return error.code === AppErrorCode.NOT_FOUND ? 'Sunum bulunamadı.' : error.code === AppErrorCode.PERMISSION_DENIED ? 'Bu sunumu görüntüleme izniniz yok.' : 'Sunum yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.';
}
const corrupt = 'Sunum içeriği eksik veya bozuk. Tekrar deneyin.';

function ViewerSession({ id, uid, isAdmin, service, onClose }: { id: string; uid: string; isAdmin: boolean; service: ViewerReadService; onClose: () => void }) {
  const root = useRef<HTMLElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const retainedDownloads = useRef(new Map<string, number>());
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [info, setInfo] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const panelId = useId();

  useLayoutEffect(() => {
    alive.current = true;
    const element = root.current;
    const change = () => setFullscreen(document.fullscreenElement === element);
    document.addEventListener('fullscreenchange', change);
    return () => {
      alive.current = false;
      document.removeEventListener('fullscreenchange', change);
      // Only the fullscreen state owned by this viewer is ours to exit.
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
      // Activated downloads keep their short lease across unmount so the browser can consume them.
      // Their timers always revoke, without accessing React state or keeping DOM/listeners alive.
    };
  }, []);

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const result = await service.getDeck(id);
        if (!current || !alive.current) return;
        if (!result.ok) { setState({ status: 'error', message: errorText(result.error) }); return; }
        const deck = result.value;
        if (deck.id !== id || (deck.status !== 'published' && deck.ownerUid !== uid && !isAdmin)) {
          setState({ status: 'error', message: 'Bu sunumu görüntüleme izniniz yok.' }); return;
        }
        if (!validContentMetadata(deck)) { setState({ status: 'error', message: corrupt }); return; }
        if (deck.kind === 'pptx') { setState({ status: 'ready', deck }); return; }
        const chunks = await service.getAllChunks(id, deck.chunkCount);
        if (!current || !alive.current) return;
        if (!chunks.ok) { setState({ status: 'error', message: errorText(chunks.error) }); return; }
        const content = reconstructPresentation(chunks.value, deck.chunks, deck.kind, deck.sizes);
        if (!content.ok || !content.value.html || content.value.rawBytes.length !== deck.sizes.unpacked) {
          setState({ status: 'error', message: corrupt }); return;
        }
        setState({ status: 'ready', deck, html: content.value.html });
      } catch { if (current && alive.current) setState({ status: 'error', message: 'Sunum yüklenemedi. Tekrar deneyin.' }); }
    }
    void load();
    return () => { current = false; };
  }, [id, uid, isAdmin, service, attempt]);

  const toggleFullscreen = useCallback(async () => {
    const element = root.current;
    if (!element) return;
    setFullscreenError('');
    try {
      if (document.fullscreenElement === element) await document.exitFullscreen();
      else if (!element.requestFullscreen || !document.fullscreenEnabled) { setFullscreenError('Bu tarayıcı tam ekranı desteklemiyor.'); return; }
      else if (document.fullscreenElement) { setFullscreenError('Önce açık olan diğer tam ekran görünümünden çıkın.'); return; }
      else await element.requestFullscreen();
    } catch { if (alive.current) setFullscreenError('Tam ekran açılamadı. Tam Ekran düğmesiyle tekrar deneyin.'); }
  }, []);

  const close = useCallback(() => {
    if (document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => {});
    onClose();
  }, [onClose]);

  async function download() {
    if (busy.current || state.status !== 'ready' || state.deck.kind !== 'pptx') return;
    busy.current = true; setDownloading(true); setDownloadError('');
    const deck = state.deck;
    try {
      const chunks = await service.getAllChunks(id, deck.chunkCount);
      if (!alive.current) return;
      if (!chunks.ok) { setDownloadError('Dosya indirilemedi. Tekrar deneyin.'); return; }
      const content = reconstructPresentation(chunks.value, deck.chunks, deck.kind, deck.sizes);
      if (!content.ok || content.value.rawBytes.length !== deck.sizes.unpacked) { setDownloadError(corrupt); return; }
      const url = URL.createObjectURL(new Blob([new Uint8Array(content.value.rawBytes)], { type: PPTX_MIME }));
      const link = document.createElement('a');
      link.href = url; link.download = safeDownloadName(deck.fileName);
      document.body.append(link);
      try { link.click(); } finally {
        link.remove();
        // Chromium consumes the URL asynchronously; immediate unmount must not revoke too soon.
        const leases = retainedDownloads.current;
        const timer = window.setTimeout(() => { URL.revokeObjectURL(url); leases.delete(url); }, 30_000);
        leases.set(url, timer);
      }
    } catch { if (alive.current) setDownloadError('Dosya indirilemedi. Tekrar deneyin.'); }
    finally { busy.current = false; if (alive.current) setDownloading(false); }
  }

  const deck = state.status === 'ready' ? state.deck : null;
  return <main ref={root} className="vektor-viewer" aria-label="Sunum görüntüleyici" onKeyDown={event => {
    const active = document.activeElement;
    if (!active || !root.current?.contains(active) || active.tagName === 'IFRAME' ||
      active.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]') ||
      event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.repeat) return;
    if (event.key.toLowerCase() === 'f') { event.preventDefault(); void toggleFullscreen(); }
    else if (event.key === 'Escape') {
      event.preventDefault();
      if (document.fullscreenElement === root.current) void toggleFullscreen(); else close();
    }
  }}>
    <header className="viewer-topbar">
      <button className="viewer-button viewer-close" onClick={close} aria-label="Sunumu kapat"><Icon type="close" /><span>Kapat</span></button>
      <div className="viewer-heading"><h1>{deck?.title || 'Sunum'}</h1>{deck && <p>{deck.ownerName || 'İsimsiz üye'}</p>}</div>
      <div className="viewer-actions">
        {deck?.kind === 'html' && <button className="viewer-button" aria-expanded={info} aria-controls={panelId} onClick={() => setInfo(value => !value)}><Icon type="info" />Bilgi</button>}
        <button className="viewer-button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? 'Tam ekrandan çık' : 'Tam Ekran'} aria-pressed={fullscreen} title="Tam Ekran (F)"><Icon type="fullscreen" /><span className="viewer-fullscreen-label">{fullscreen ? 'Tam ekrandan çık' : 'Tam Ekran'}</span></button>
      </div>
    </header>
    {fullscreenError && <p className="viewer-inline-error" role="alert">{fullscreenError}</p>}
    {state.status === 'loading' && <StatePanel title="Sunum yükleniyor…" description="İçerik hazırlanırken lütfen bekleyin." kind="loading"/>}
    {state.status === 'error' && <StatePanel title={state.message} kind="error"><button className="viewer-button" onClick={() => { setState({ status: 'loading' }); setAttempt(value => value + 1); }}>Tekrar dene</button></StatePanel>}
    {state.status === 'ready' && (state.deck.kind === 'html' ? <div className={`viewer-stage${info ? ' viewer-stage-info' : ''}`}>
      <div className="viewer-frame-area"><iframe ref={frame} title={`${state.deck.title} — sunum`} sandbox="allow-scripts" allow="fullscreen" srcDoc={state.html} /></div>
      <aside id={panelId} className="viewer-panel" hidden={!info} aria-label="Sunum bilgileri"><Metadata deck={state.deck} /></aside>
    </div> : <div className="viewer-pptx"><div className="viewer-pptx-grid"><Cover deck={state.deck} /><div><Metadata deck={state.deck} /><div className="viewer-download"><button className="viewer-button viewer-primary" onClick={() => void download()} disabled={downloading}><Icon type="download" />{downloading ? 'İndiriliyor…' : 'PPTX dosyasını indir'}</button><p className="viewer-warning">Bu dosya antivirüs taramasından geçirilmemiştir. Açmadan önce güvenlik yazılımınızla tarayın.</p><p role="status" aria-live="polite">{downloading ? 'Dosya indirme için hazırlanıyor…' : ''}</p>{downloadError && <p role="alert">{downloadError}</p>}</div></div></div></div>)}
    <footer className="viewer-footer"><span>VEKTÖR</span>{deck?.kind === 'html' && <button className="viewer-button" onClick={() => frame.current?.focus()}>Sunuma odaklan</button>}<p>{deck?.kind === 'html' ? 'Sunumun kendi kontrollerini kullanın. Tuşlarla kontrol için önce sunuma tıklayın. ' : ''}Uygulama kontrollerindeyken F: Tam Ekran · Esc: Kapat</p></footer>
  </main>;
}
