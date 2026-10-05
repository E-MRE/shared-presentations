import { useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { PresentationEditor, UploadPage, EditPage } from '../../src/features/editor';
import { AppLayout } from '../../src/layout';
import { ThemeProvider, ThemeToggle, useTheme } from '../../src/theme';
import { authState, fixtureContent, fixtureService, flags, metrics, inputs, release, reset } from './fixtures';
import * as contentApi from '../../src/content';
import { readPresentationFiles } from '../../src/features/editor/input';
import '../../src/styles/index.css';
export interface EditorHarness {
  navigate(path: string): void; auth(value: string): void; edit(id?: string): void; create(): void; mount(value: boolean): void; service(): void; content(): void; flags(value: Partial<typeof flags>): void; release(kind: string): void; reset(): void; theme(value: 'light' | 'dark'): void;
}
declare global { interface Window { editor: EditorHarness; editorMetrics: typeof metrics; editorInputs: typeof inputs; editorContent: typeof contentApi; readEditorFiles: typeof readPresentationFiles; } }
window.editorMetrics = metrics; window.editorInputs = inputs; window.editorContent = contentApi; window.readEditorFiles = readPresentationFiles;
const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = blob => { const url = create(blob); metrics.urls.push(url); return url; };
URL.revokeObjectURL = url => { metrics.revoked.push(url); revoke(url); };
function Harness() {
  const navigate = useNavigate();
  const { setPreference, theme } = useTheme();
  const [role, setRole] = useState('unauthenticated');
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [id, setId] = useState<string | undefined>('own');
  const [mounted, setMounted] = useState(true);
  const [serviceVersion, setServiceVersion] = useState(0), [contentVersion, setContentVersion] = useState(0);
  const service = useMemo(fixtureService, [serviceVersion]);
  const content = useMemo(fixtureContent, [contentVersion]);
  const auth = authState(role);
  window.editor = { navigate: value => flushSync(() => navigate(value)), auth: value => flushSync(() => setRole(value)), edit: value => flushSync(() => { setMode('edit'); setId(value); }), create: () => flushSync(() => { setMode('create'); setServiceVersion(value => value + 1); }), mount: value => flushSync(() => setMounted(value)), service: () => flushSync(() => setServiceVersion(value => value + 1)), content: () => flushSync(() => setContentVersion(value => value + 1)), flags: value => Object.assign(flags, value), release, reset, theme: value => flushSync(() => setPreference(value)) };
  const props = { auth, service, content, onClose: () => { metrics.closes++; }, onComplete: (deck: { id: string; status: string }) => { metrics.completions.push(deck.id); metrics.completionStatuses.push(deck.status); } };
  return <AppLayout auth={auth} actions={<ThemeToggle />}><span id="theme-label" hidden>Tema: {theme}</span>{mounted && <Routes><Route path="/tests/editor/harness.html" element={<PresentationEditor {...props} mode={mode} id={id} />} /><Route path="/yeni" element={<UploadPage auth={auth} service={service} content={content} />} /><Route path="/duzenle/:id" element={<EditPage auth={auth} service={service} content={content} />} /><Route path="/benim" element={<h1>Benim Sunumlarım</h1>} /><Route path="/s/:id" element={<h1>Sunum görüntüleyici</h1>} /></Routes>}</AppLayout>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><ThemeProvider><Harness /></ThemeProvider></BrowserRouter>);
