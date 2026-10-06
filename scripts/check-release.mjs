import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
let failures = 0;
function check(name, condition) { console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`); if (!condition) failures++; }
function read(path) { try { return readFileSync(resolve(root, path), 'utf8'); } catch { return ''; } }
function json(path) { try { return JSON.parse(read(path)); } catch { return {}; } }
const firebase = json('firebase.json'), projects = json('.firebaserc');
check('Firebase project is pinned to shared-presentations', projects.projects?.default === 'shared-presentations');
check('Firestore rules and indexes are configured', firebase.firestore?.rules === 'firestore.rules' && firebase.firestore?.indexes === 'firestore.indexes.json');
check('SPA rewrite and dist target', firebase.hosting?.public === 'dist' && firebase.hosting.rewrites?.some(rule => rule.source === '**' && rule.destination === '/index.html'));
const headers = firebase.hosting?.headers ?? [];
const header = (source, key) => headers.find(item => item.source === source)?.headers?.find(item => item.key.toLowerCase() === key.toLowerCase())?.value ?? '';
check('HTML no-cache and immutable hashed assets', /no-cache/.test(header('**', 'Cache-Control')) && /immutable/.test(header('/assets/**', 'Cache-Control')));
const csp = header('**', 'Content-Security-Policy');
check('Shell CSP, frame isolation and nosniff', /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /frame-src/.test(csp) && header('**', 'X-Content-Type-Options') === 'nosniff');
check('Source HTML loads the real entry', /<script type="module" src="\/src\/main\.tsx"><\/script>/.test(read('index.html')) && !read('index.html').includes('foundation-placeholder'));
const builtHtml = read('dist/index.html');
const modulePaths = [...builtHtml.matchAll(/<script\b[^>]*src="([^\"]+)"[^>]*>/g)].map(match => match[1]);
check('Built HTML references emitted JavaScript', modulePaths.some(path => /\/assets\/.*\.js$/.test(path) && existsSync(resolve(root, 'dist', path.slice(1)))));
const assets = existsSync(resolve(root, 'dist/assets')) ? readdirSync(resolve(root, 'dist/assets')).filter(path => path.endsWith('.js')).map(path => read(`dist/assets/${path}`)).join('\n') : '';
check('Built application contains six frozen route paths', ['/', '/benim', '/yeni', '/duzenle/:id', '/admin', '/s/:id'].every(path => ['"', "'", '`'].some(quote => assets.includes(quote + path + quote))));
check('Built output includes application gates, not foundation placeholder', assets.includes('İyi fikirler') && !assets.includes('foundation-placeholder') && !assets.includes('Uygulama temeli hazır.'));
check('Production main uses real App without fixture switches', read('src/main.tsx').includes('<App />') && !/harness|fixture|window\./i.test(read('src/main.tsx')));
for (const path of ['README.md', 'docs/OPERATIONS.md', 'docs/ACCEPTANCE.md']) check(`Release documentation exists: ${path}`, read(path).length > 100);
const operations = read('docs/OPERATIONS.md'), acceptance = read('docs/ACCEPTANCE.md');
check('Manual OAuth/mail/domain/CSP/Hosting and approval limitations documented', ['OAuth', 'mail', 'authorized domains', 'CSP', 'Hosting', 'approval'].every(term => (operations + acceptance).includes(term)));
check('Rules-first release order and explicit project commands documented', operations.includes('--project shared-presentations') && operations.includes('rules first'));
console.log(`${failures ? 'BLOCKED' : 'PASS'} local release checks (${failures} failure${failures === 1 ? '' : 's'}). Live release acceptance remains manual.`);
process.exitCode = failures ? 1 : 0;
