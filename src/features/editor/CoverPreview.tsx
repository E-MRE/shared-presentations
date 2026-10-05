import { useEffect, useRef } from 'react';
import type { CoverDescriptor } from '../../content';
export function CoverPreview({ cover, title }: { cover?: CoverDescriptor; title: string }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!cover?.bytes.length) return;
    const url = URL.createObjectURL(new Blob([new Uint8Array(cover.bytes)], { type: cover.mimeType }));
    if (image.current) image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [cover]);
  return <div className="editor-cover">{cover?.bytes.length ? <img ref={image} alt={`${title || 'Sunum'} kapak görseli`} width="640" height="360" /> : <div><span>VEKTÖR</span><p>Dosya hazırlandığında kapak burada görünür.</p></div>}</div>;
}
