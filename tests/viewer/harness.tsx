import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PresentationViewer, ViewerPage } from '../../src/features/viewer';
import { authState, fixtureService, metrics, release, type Scenario } from './fixtures';
import '../../src/styles/index.css';

export interface ViewerHarness {
  scenario: (value: Scenario) => void; auth: (value: string) => void; id: (value?: string) => void; mount: (value: boolean) => void; release: () => void;
  theme: (value: 'light' | 'dark') => void;
}
declare global { interface Window { viewer: ViewerHarness; viewerMetrics: typeof metrics; unmountViewer: () => void; } }
window.viewerMetrics = metrics;
const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = blob => { const url = create(blob); metrics.urls.push({ url, type: blob instanceof Blob ? blob.type : '', size: blob instanceof Blob ? blob.size : 0 }); return url; };
URL.revokeObjectURL = url => { metrics.revoked.push(url); revoke(url); };
const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
document.addEventListener = ((type: string, ...args: unknown[]) => { if (type === 'fullscreenchange') metrics.fullscreenListeners++; return Reflect.apply(add, document, [type, ...args]); }) as typeof add;
document.removeEventListener = ((type: string, ...args: unknown[]) => { if (type === 'fullscreenchange') metrics.fullscreenListeners--; return Reflect.apply(remove, document, [type, ...args]); }) as typeof remove;
const click = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function () { if (this.download) metrics.downloads.push({ href: this.href, name: this.download }); click.call(this); };
function Harness() {
  const [role, setRole] = useState(new URLSearchParams(location.search).get('auth') || 'member');
  const [id, setId] = useState<string | undefined>('deck');
  const [scenario, setScenario] = useState<Scenario>({});
  const [mounted, setMounted] = useState(true);
  const [closes, setCloses] = useState(0);
  const service = useMemo(() => fixtureService(scenario), [scenario]);
  const auth = authState(role);
  window.viewer = { scenario: setScenario, auth: setRole, id: setId, mount: setMounted, release, theme: value => { document.documentElement.dataset.theme = value; document.documentElement.style.colorScheme = value; } };
  return <><span aria-hidden="true" id="close-count" style={{ position: 'absolute', left: '-10000px' }}>{closes}</span>{mounted && <Routes><Route path="/tests/viewer/harness.html" element={<PresentationViewer id={id} auth={auth} service={service} onClose={() => { metrics.closes++; setCloses(value => value + 1); }} />} /><Route path="/s/:id" element={<ViewerPage auth={auth} service={service} />} /><Route path="/" element={<h1>Sunum Arşivi</h1>} /></Routes>}</>;
}
const root = createRoot(document.getElementById('root')!);
window.unmountViewer = () => root.unmount();
root.render(<BrowserRouter><Harness /></BrowserRouter>);
