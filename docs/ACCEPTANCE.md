# Acceptance record

Lane L09, campaign vektor-l09, base `f4fdb972d4bbf941bfe532f17923838e26ed9b8b`, worker branch `work/app-integration`. Exact final worker SHA, command records, counts, screenshots and unresolved acceptance are recorded in the ignored `L09/worker/attempt2/handoff.json`. This file describes reproducible scope; it does not certify live release acceptance or external verification. The operator explicitly authorized only the body-module replacement in `index.html`; the original prepaint head is preserved.

| BRIEF §8 | Automated evidence and command | Manual limits |
| --- | --- | --- |
| 1 Build/lint/rules/upload | Final `npm run lint`, `npm run build`; project-pinned Firestore emulator auth/data/rules regression; upload and Chromium feature regression | Check exact command exits/counts in handoff; skipped emulator tests are not accepted |
| 2 Rules then Hosting | Read-only `node scripts/check-release.mjs` validates project, entry, emitted routes, SPA/cache/CSP configuration | Deployment needs approval; actual Hosting URL and headers remain pending |
| 3 Google/email/verification | SDK transport and boundary generation tests; DI browser auth/signup/reset/unverified states, zero deck reads at gates | Real OAuth and verification/reset mail delivery require human checks; signup mail result is unknown in frozen service |
| 4 Fixtures/zip/PPTX/quota | Real content/editor regression validates fixtures, ZIP/PPTX and bounds; full-app create payload flow; rules validate pending quota | Full production upload of every design fixture and thumbnail comparison remains manual |
| 5 Private reads/status | Emulator rules/data regression, denied composition gates, foreign-owner editor and viewer paths | Approved manual console attempt remains pending |
| 6 Review flow | Full-app approve/reject-note/owner visibility/unpublish/reapprove/delete with exact typed payload checks; frozen library/admin runtime regression | Live multi-account workflow remains manual |
| 7 Theater | Opaque HTML iframe, exact allow-scripts sandbox plus fullscreen permission, download and keyboard tests; frozen viewer isolation regression | Native fullscreen/device keys and deployed CSP require human verification |
| 8 Theme/screens | Real ThemeProvider, 375/1280 light/dark route/state captures, persistence/reload/storage-failure checks; frozen UI prepaint tests | Visual comparison, other browsers/devices and production no-flash remain manual |
| 9 Published owner edit | Full-app edit payload returns pending and removes feed visibility; editor/data/rules regressions | Live approved workflow remains manual |

Browser application scenarios use an explicitly labeled test-only HTML harness with typed dependencies. They exercise the actual App/router/features/content code. Separate production-entry smoke tests load the real `index.html`/`main.tsx` with remote traffic blocked and verify visitor/bootstrap/deep-link recovery. Deterministic DI does not prove emulator or live authority; only the emulator regression supports backend claims.

One main landmark is used for normal routes; the HTML/PPTX viewer owns its own main. Auth dialogs serialize through the frozen shared Modal, with visible labels, native autocomplete, unrestricted paste, keyboard trap, Escape and focus restoration. Admin pending count has one contextual Header announcement and a retry control after errors. Route and auth changes remount the count subscription.

Known owner-scope UI requests remain outside L09: viewer sizes below 1 MB should display KB, and the original shared footer needs a 375px wrapping review. L09 supplies naturally wrapping footer copy through the existing slot without changing shared CSS. Browser stress failures or any remaining overflow must be recorded in the handoff, never silently accepted.

Release order: exact worker commit → external fresh-context verification → PASS → secret scan → STOP for explicit push approval. Deployment is separately approved, with rules first. No push, deployment or live acceptance was performed by this lane.
