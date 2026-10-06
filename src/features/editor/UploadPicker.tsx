import { useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import type { DeckKind } from '../../contracts/models';
import { readDroppedFiles, EditorInputError } from './input';
import { useToast } from '../../components/toastContext';

const directoryAttributes = { webkitdirectory: '', directory: '' } as InputHTMLAttributes<HTMLInputElement>;
type Mode = 'bundle' | 'single' | 'pptx';
const choices: Array<{ mode: Mode; label: string }> = [
  { mode: 'bundle', label: 'HTML (Klasör / ZIP)' }, { mode: 'single', label: 'Tek HTML' }, { mode: 'pptx', label: 'PowerPoint' },
];
export function UploadPicker({ kind, disabled, select }: { kind?: DeckKind; disabled: boolean; select: (files: File[], directory?: boolean) => Promise<void> }) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(kind === 'pptx' ? 'pptx' : 'bundle');
  const [dragging, setDragging] = useState(false), [dropError, setDropError] = useState(''), [reading, setReading] = useState(false);
  const file = useRef<HTMLInputElement>(null), directory = useRef<HTMLInputElement>(null), dropLock = useRef(false);
  const tabs = choices.filter(choice => !kind || (kind === 'pptx' ? choice.mode === 'pptx' : choice.mode !== 'pptx'));
  const busy = disabled || reading;
  const heading = mode === 'bundle' ? 'HTML klasörünüzü veya ZIP arşivinizi sürükleyin' : mode === 'single' ? 'HTML dosyanızı buraya sürükleyin' : 'PowerPoint dosyanızı buraya sürükleyin';
  const hint = mode === 'bundle' ? 'CSS, JavaScript ve görselleriyle birlikte sunum klasörünüzü seçin.' : mode === 'single' ? 'Tek başına çalışan bir .html dosyası seçin.' : 'Sunumunuz .pptx dosyası olarak saklanır ve indirilebilir.';
  function activate(value: Mode) { setMode(value); setDropError(''); }
  function keys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    activate(tabs[next].mode); document.getElementById(`upload-tab-${tabs[next].mode}`)?.focus();
  }
  return <div className="upload-picker">
    <div className="upload-tabs" role="tablist" aria-label="Sunum biçimi">{tabs.map((choice, index) => <button key={choice.mode} id={`upload-tab-${choice.mode}`} role="tab" type="button" aria-selected={mode === choice.mode} aria-controls="upload-panel" tabIndex={mode === choice.mode ? 0 : -1} disabled={busy} onClick={() => activate(choice.mode)} onKeyDown={event => keys(event, index)}>{choice.label}</button>)}</div>
    <div id="upload-panel" role="tabpanel" aria-labelledby={`upload-tab-${mode}`} className={`editor-dropzone${dragging ? ' editor-dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={async event => {
      event.preventDefault(); setDragging(false); if (busy || dropLock.current) return;
      dropLock.current = true; setReading(true); setDropError('');
      // Capture entries before the event's data transfer becomes unavailable.
      const pending = readDroppedFiles(event.dataTransfer);
      try {
        const input = await pending;
        const valid = mode === 'bundle' ? input.directory || (input.files.length === 1 && /\.zip$/i.test(input.files[0].name)) : !input.directory && input.files.length === 1 && (mode === 'single' ? /\.html?$/i : /\.pptx$/i).test(input.files[0].name);
        if (!valid) throw new EditorInputError('Seçili sekmeye uygun bir dosya sürükleyin veya sunum biçimini değiştirin.');
        await select(input.files, input.directory);
      } catch (error) { const message = error instanceof EditorInputError ? error.message : 'Sürüklenen dosyalar okunamadı. Dosya seçim düğmesini deneyin.'; setDropError(message); toast.notify({ message, kind: 'error', key: 'editor-feedback' }); }
      finally { dropLock.current = false; setReading(false); }
    }}>
      <svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6" /></svg>
      <h3>{heading}</h3><p className="editor-hint">{hint}</p>
      <div className="upload-actions">{mode === 'bundle' && <><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => directory.current?.click()}>Klasör seç</button><input ref={directory} {...directoryAttributes} hidden id="editor-directory" aria-label="HTML klasörü seç" type="file" multiple disabled={busy} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) { setDropError(''); void select(files, true); } }}/></>}
        <button id="editor-file-trigger" type="button" className="btn btn-primary" disabled={busy} onClick={() => file.current?.click()}>{mode === 'bundle' ? 'ZIP seç' : mode === 'single' ? 'HTML dosyası seç' : 'PPTX dosyası seç'}</button>
        <input ref={file} hidden id="editor-file" type="file" aria-label={mode === 'bundle' ? 'ZIP arşivi seç' : mode === 'single' ? 'HTML dosyası seç' : 'PPTX dosyası seç'} accept={mode === 'bundle' ? '.zip' : mode === 'single' ? '.html,.htm' : '.pptx'} disabled={busy} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) { setDropError(''); void select(files); } }}/>
      </div>
      <p id="editor-file-hint" className="upload-limits editor-hint">{mode === 'pptx' ? 'PPTX · En fazla 8 MB' : mode === 'single' ? 'HTML · En fazla 25 MB · Hazırlanan içerik en fazla 5 MB' : 'En fazla 300 dosya · Açılmış boyut 25 MB · Sıkıştırılmış boyut 5 MB · ZIP dosyası en fazla 25 MB'}</p>
      {reading && <p role="status">Dosyalar okunuyor…</p>}
    </div>{dropError && <p className="editor-error">{dropError}</p>}
  </div>;
}
