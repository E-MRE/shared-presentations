import { zipSync, strToU8 } from 'fflate';
export const smallHtml = '<!doctype html><html><head><title>Test Sunumu</title><style>body{background:#f9fafb;color:#111827;font:24px sans-serif;padding:32px}</style></head><body><h1 id="deck-only">Test Sunumu</h1><script>try { parent.document.body.dataset.escaped="yes"; } catch { document.body.dataset.isolated="yes"; }</script></body></html>';
export const raster = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
export const pptx = Buffer.from(zipSync({
  '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'),
  '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'),
  'ppt/presentation.xml': strToU8('<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst/></p:presentation>'),
}));
export const zip = Buffer.from(zipSync({ 'slides/index.html': strToU8('<html><head><title>ZIP Sunumu</title><link rel="stylesheet" href="style.css"></head><body><h1>ZIP sunumu</h1></body></html>'), 'slides/style.css': strToU8('body{background:#132033;color:white;font-family:sans-serif;padding:40px}') }));
