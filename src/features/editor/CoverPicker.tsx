import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useToast } from '../../components/toastContext';

interface CoverPickerProps {
  disabled: boolean;
  hasAuto: boolean;
  hasOriginal: boolean;
  choose: (file: File) => Promise<void>;
  reset: (source: 'default' | 'auto' | 'original') => Promise<void>;
}

export function CoverPicker({ disabled, hasAuto, hasOriginal, choose, reset }: CoverPickerProps) {
  const [mode, setMode] = useState<'upload' | 'ready'>('upload');
  const [dragging, setDragging] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const id = useId();
  const toast = useToast();
  const choices = [{ value: 'upload', label: 'Görsel yükle' }, { value: 'ready', label: 'Hazır kapak' }] as const;
  function keys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? 1 - index : undefined;
    if (next === undefined) return;
    event.preventDefault(); setMode(choices[next].value); document.getElementById(`${id}-tab-${choices[next].value}`)?.focus();
  }
  return <div className="cover-picker">
    <div className="upload-tabs" role="tablist" aria-label="Kapak seçimi">{choices.map((choice, index) => <button key={choice.value} id={`${id}-tab-${choice.value}`} type="button" role="tab" aria-selected={mode === choice.value} aria-controls={`${id}-${choice.value}`} tabIndex={mode === choice.value ? 0 : -1} disabled={disabled} onClick={() => setMode(choice.value)} onKeyDown={event => keys(event, index)}>{choice.label}</button>)}</div>
    <div id={`${id}-upload`} role="tabpanel" aria-labelledby={`${id}-tab-upload`} hidden={mode !== 'upload'} className={`editor-dropzone${dragging ? ' editor-dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={event => {
      event.preventDefault(); setDragging(false); if (disabled) return;
      const files = Array.from(event.dataTransfer.files);
      if (files.length !== 1) { toast.notify({ message: 'Kapak için tek bir JPEG, PNG veya WebP görseli seçin.', kind: 'error', key: 'editor-feedback' }); return; }
      void choose(files[0]);
    }}>
      <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/></svg>
      <h3>Bir kapak görseli ekleyin</h3><p className="editor-hint">Görselinizi buraya sürükleyin veya cihazınızdan seçin.</p>
      <div className="upload-actions"><button type="button" className="btn btn-primary" disabled={disabled} onClick={() => file.current?.click()}>Kapak görseli seç</button></div>
      <input ref={file} hidden id="editor-cover-file" aria-label="Kapak görseli seç" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={event => { const selected = event.target.files?.[0]; event.target.value = ''; if (selected) void choose(selected); }}/>
      <p className="upload-limits editor-hint">JPEG, PNG veya WebP · En fazla 10 MB</p>
      <p className="editor-hint">Görseliniz 16:9 oranında kırpılır.</p>
    </div>
    <div id={`${id}-ready`} role="tabpanel" aria-labelledby={`${id}-tab-ready`} hidden={mode !== 'ready'} className="cover-ready-panel"><p className="editor-hint">Yeni görsel yüklemeden bir kapak seçin.</p><div className="editor-cover-actions">
      {hasAuto && <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => void reset('auto')}>Otomatik kapağı kullan</button>}
      <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => void reset('default')}>Varsayılan kapağa dön</button>
      {hasOriginal && <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => void reset('original')}>Mevcut kapağı koru</button>}
    </div></div>
  </div>;
}
