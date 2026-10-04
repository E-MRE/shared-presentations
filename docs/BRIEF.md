# Vektör — Team Presentation Library: build brief

Repo: `/opt/projects/shared-presentations` (GitHub `E-MRE/shared-presentations`, branch `main`).
Firebase project: `shared-presentations` (Spark/free plan). UI language: Turkish (`lang="tr"`). Code, comments, commits, docs: English.

## 0. Hard rules (read first)
1. **Firebase target is ALWAYS `shared-presentations`.** The CLI login can see ~14 other projects. Pin it in `.firebaserc` (`default`) AND pass `--project shared-presentations` on every CLI command. Never run any command against another project.
2. Firebase CLI: `npx -y --engine-strict=false firebase-tools <cmd>` from a writable cwd (container Node is 26; npm has `engine-strict=true`; `firebase-debug.log` is written to cwd). Add `firebase-tools` as a devDependency. If emulators misbehave on Node 26, use Node 24.
3. Deploys (`firebase deploy`) and `git push` to `main` need Telegram approval. Work on branches `hermes/<lane>-<topic>`, open PRs.
4. Never copy the reference prototype's fake login (typed e-mail / localStorage user). Never use `allow-same-origin` on any iframe that renders uploaded content.
5. No admin e-mail address in committed code (repo is public). Admin role = Firestore doc `admins/{uid}` created by the user in the Console (see §5).
6. Do not use Firebase Storage or SQL Connect. Everything lives in Firestore (Spark plan: 1 GiB stored, 50k reads/day, 20k writes/day — design for it).
7. `$ui-ux-pro-max` skill is installed for Codex — use it for UI work, but `design/` (§2) wins on any conflict.

## 1. Product
Team presentation library. Team members upload HTML decks or .pptx files; an admin approves; approved decks appear in a shared feed and can be watched in a fullscreen theater (HTML) or downloaded (PPTX). Zero server cost: all processing in the browser, content stored chunked in Firestore.

### Roles
- **Visitor (signed out):** sees sign-in screen/empty state only. (User decision 2026-10-02: signed-out users cannot see any decks.)
- **Member (signed in):** Google sign-in, or e-mail/password with **verified e-mail** (send verification mail on sign-up; block upload until verified; password reset flow). Can upload, see/edit own decks.
- **Admin:** everything a member can + review queue, approve, reject with note, unpublish, re-approve, delete any deck. Header shows live pending-count badge.

### Routes
| Route | Screen |
|---|---|
| `/` | Published feed: card grid, newest first (`publishedAt desc`), search by title/description/author |
| `/benim` | My decks, all statuses, with status badge + reject note |
| `/yeni` | Upload |
| `/duzenle/:id` | Edit own deck (metadata, cover, links, replace file) |
| `/admin` | Review desk: pending queue + all decks with actions |
| `/s/:id` | HTML: theater viewer (sandboxed iframe) + "Bilgi" side panel. PPTX: detail page (cover, description, links, download button, antivirus warning) |

### Status flow
`pending → published` (approve) · `pending → rejected` (reject, note required, shown to owner) · `published → unpublished` (admin) · `unpublished|rejected → published` (admin re-approve) · owner edit of any deck → `pending` (re-review). Admin delete removes deck + chunks.
Pending quota: max **5** pending decks per user.

### Upload
- Inputs: HTML folder (`webkitdirectory`), `.zip`, single `.html`, or `.pptx`. Drag & drop + file picker.
- **Client-side bundler (HTML):** find entry (`index.html`, else the only/first `.html`), inline linked CSS, JS, images, fonts (incl. `url()` inside CSS, `srcset`) as data URIs → one self-contained HTML. Warn about external URLs left unresolved.
- Limits: bundle ≤ 300 files, ≤ 25 MB unpacked, ≤ 5 MB gzip-compressed. PPTX ≤ 8 MB. Validate before any write; clear Turkish error messages.
- Storage: gzip (`CompressionStream`) → split into chunks of ≤ 900 KB stored as Firestore `Bytes` (no base64) → max 12 chunks. Reassemble + `DecompressionStream` on view.
- **Cover / thumbnail:**
  - HTML: auto first-page capture at upload — render the bundle once in a hidden iframe with `sandbox="allow-scripts"` only, inject a capture script (e.g. `modern-screenshot`, inlined), wait for load + fonts (+ short timeout), capture the first viewport at 16:9, `postMessage` the PNG to the parent. Parent validates message source, resizes to 640 px wide WebP/JPEG (~≤100 KB).
  - User may override with their own image (same resize). PPTX, or capture failure/timeout (~8 s): uploaded image or generated default cover (title on brand surface, no gradient).
  - Known ceiling: WebGL/canvas/late-loading content may capture imperfectly — that's why override exists.
- The pipeline details above (chunk size, capture method, libraries) are suggestions; the limits and behaviors are requirements.
- Fields: title (required), description, resource links (max 10, `https:` only, label + URL). **No category, no slide count, no duration.**
- Upload preview iframe uses the same sandbox as the theater.

### Theater (`/s/:id`, HTML)
- `<iframe sandbox="allow-scripts" allow="fullscreen" srcdoc=...>` (or blob URL). `allow-fullscreen` is NOT a valid sandbox token (Chromium rejects it, verified 2026-10-02); fullscreen permission comes from `allow="fullscreen"`. Never `allow-same-origin`, never `allow-popups`.
- Our chrome: back/close, title + author, "Bilgi" panel toggle, fullscreen button (`F`), `Esc` closes. **No slide counter, no prev/next, no postMessage slide bridge** — if the deck has its own navigation it works inside the iframe; focus the iframe so its keys work.
- Theater is always dark, also in light theme.
- Cards and feed never contain live iframes — cover image only.

## 2. Design
Reference = target look; match it as closely as possible. New screens (`/benim`, `/yeni`, `/duzenle`, `/admin`, PPTX detail, reject modal, auth modal states) are derived from the same system.
- `design/index.html`, `design/css/tokens.css`, `design/css/styles.css`, `design/js/app.js` (visual/behavioral reference only — not production code), `design/design-system/deckhub/MASTER.md` (spec, single source of truth), `design/design-system/tokens.json`, `design/presentations/*.html` (demo decks → use as upload test fixtures).
- Older screenshots of the functional prototype: `docs/reference/` (functional reference only, not visual).
- Brand **Vektör**. Plus Jakarta Sans + JetBrains Mono. Dark default + light. 3-layer tokens (primitive → semantic → component). SVG icons only (no emoji). No decorative gradients. `:focus-visible` rings. `prefers-reduced-motion`. WCAG AA minimum.
- **Ignore from the reference:** category strip/filter/field, slide count, card slide-scrubber dots, theater ←/→ slide bridge + counter, live card previews, `allow-same-origin`/`allow-popups`, unsandboxed upload preview, localStorage login.
- Theme: `data-theme` on `<html>`; inline pre-paint script in `<head>` reads stored choice (try/catch around all storage) else `prefers-color-scheme`; set `color-scheme` per theme.
- Reject = real modal with required note (no `prompt()`), confirm modals for delete/unpublish.

## 3. Stack
Default: **Vite + React + TypeScript SPA**, React Router, Firebase JS SDK (latest, modular) (`auth`, `firestore` only). Port `tokens.css` + `styles.css` as global CSS (keep class names where sensible). Minimal deps: `fflate` or native streams for zip/gzip, `modern-screenshot` for capture. No UI kit, no CSS framework.
(User decision 2026-10-02: React + TS confirmed.)

`firebaseConfig` (public values, commit in `src/firebase.ts`):
```js
{ apiKey: "AIzaSyBhinVcRLhkPr8aMNEDCVnQHDP2xDyKpBs", authDomain: "shared-presentations.firebaseapp.com",
  projectId: "shared-presentations", storageBucket: "shared-presentations.firebasestorage.app",
  messagingSenderId: "204729641645", appId: "1:204729641645:web:c3f91079cb84ca7f837424" }
```

## 4. Security invariants (mandatory, enforced server-side in `firestore.rules`)
- Firestore is currently in **test mode (open)** → deploying real rules is the **first deploy** of the project.
- Only members can read anything: signed in AND (Google provider OR verified e-mail).
- A member reads published decks + their own decks; never another user's non-published deck or its content.
- Only admins change status/review fields, and only admins delete published decks.
- Owners can only create decks as `pending`; any owner edit puts the deck back to `pending`.
- Pending quota (5 per user) and size/count limits (§1) are enforced by rules, not only by the UI.
- Admin role is decided server-side and cannot be granted by any client write. No admin e-mail in code.
- Everything not explicitly allowed is denied. Rules are covered by emulator tests.

## 5. Suggested technical approach (you may change it if §4 still holds)
Data model:
- `users/{uid}`: `displayName, email, photoURL, createdAt, pendingCount`
- `admins/{uid}`: `{}` — written only from the Console (rules deny all client writes).
- `presentations/{id}`:
  `ownerUid, ownerName, ownerPhotoURL, title, description, links[{label,url}], kind ('html'|'pptx'), fileName, status ('pending'|'published'|'rejected'|'unpublished'), rejectNote, cover (Bytes), coverSource ('auto'|'upload'|'default'), sizeUnpacked, sizeCompressed, fileCount, chunkCount, createdAt, updatedAt, publishedAt, reviewedBy, reviewedAt`
- `presentations/{id}/chunks/{index}`: `index, data (Bytes)`
- Writes that change a deck + its chunks + `pendingCount` go in one batch/transaction.
- Indexes: `status + publishedAt desc`, `ownerUid + updatedAt desc`, `status + createdAt asc` (admin queue). Commit `firestore.indexes.json`.

Rules sketch:
- `isAdmin()` = `exists(/databases/$(database)/documents/admins/$(request.auth.uid))`.
- `isMember()` = signed in AND (`request.auth.token.firebase.sign_in_provider == 'google.com'` OR `request.auth.token.email_verified == true`).
- Chunks readable when parent is readable (`get()` parent).
- Create: field whitelist + types + sizes (title ≤ 120, description ≤ 2000, links ≤ 10, chunkCount ≤ 12, cover ≤ ~150 KB); `pendingCount` increment checked with `getAfter()` (≤ 5). Admin decrements it in the same batch as approve/reject/delete.

Admin setup (user does this once, after first sign-in): Console → Firestore → collection `admins` → doc ID = their Auth UID. Tell the user when it is needed.

## 6. Hosting
`firebase.json`: SPA rewrite to `/index.html`, long cache for hashed assets, no-cache for `index.html`. Headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, CSP for the app shell that still allows `srcdoc` sandboxed frames, `frame-ancestors 'none'`.
Add the Hosting domain to Auth authorized domains if not automatic.

## 7. Environment notes (server container)
- No Java → Firestore emulator won't run. Install a portable JDK 21 under `/opt/data/home/.local` (no root) for rules tests.
- No browser → for screenshots/E2E install Playwright Chromium into the hermes home if system deps allow; otherwise report and skip. RAM ~3.8 GB total (~2 GB free) → don't run several heavy jobs at once.

## 8. Acceptance (manual, plus automated where noted)
1. `npm run build` and `npm run lint` clean; rules tests pass; bundler/upload tests pass.
2. Deploy rules then hosting (with approval). App loads at the Hosting URL.
3. Google sign-in works; e-mail sign-up sends verification; unverified user cannot upload (UI + rules).
4. Upload each fixture from `design/presentations/` + one zip folder + one `.pptx` → each is `pending`, auto thumbnail visible for HTML, 6th pending upload rejected.
5. Non-admin cannot read others' pending decks or change status (verify with rules tests and a manual console attempt).
6. Admin approves → deck in feed; reject with note → owner sees note in `/benim`; unpublish / re-approve / delete work.
7. Theater: deck's own keyboard nav works, `F` fullscreen, `Esc` closes; iframe has exactly `sandbox="allow-scripts"` + `allow="fullscreen"`; deck script cannot read parent / `document.cookie` of app.
8. Light/dark toggle, no theme flash on reload, theater stays dark. Screenshots of each route compared with `design/index.html`.
9. Owner edit of a published deck returns it to `pending`.

## 9. Process
- You (orchestrator) own planning: split the work into tasks, choose workers, order and parallelize, review and merge.
- **Run 1 = plan only.** Before writing any code, send your plan to Telegram (tasks, worker per task, order/dependencies, risks, open questions), write it to `docs/PLAN.md`, then STOP. Do not start any worker. The user approves or edits on Telegram; implementation starts in a resumed run (`codex exec resume`) with the user's answer.
- Report progress at milestones (each merged PR, each deploy request, any blocker).
- If something in this brief is ambiguous or conflicts, ask on Telegram — do not guess.
