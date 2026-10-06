# Operations

Current October 6 state: UI source `d5bc1b3` is on `main`, Firestore rules were deployed at `2026-10-06T11:24:21.854713Z` and read back exactly matching the tested local file. Hosting is pending. Local previews on 4175/4173 were stopped. See the [latest verification and secret-scan record](UI-SON-DUZELTMELER-2026-10-06.md); earlier lane-specific test counts below are historical.

All Firebase CLI commands must include `--project shared-presentations`, in addition to the committed `.firebaserc` selection. Public Firebase web configuration is committed; it is not an administrator credential. No credentials, real administrator identities, email addresses or UID values should be copied into logs or committed documentation.

Google and Email/Password providers and Firestore were confirmed active by the user; no enablement action is pending. Configure the production Hosting hostname in Authentication authorized domains. Google OAuth popup, provider consent, account selection, verification mail delivery, password-reset mail delivery and mobile popup behavior require human acceptance using the approved project. Production tests in this lane do not contact live Firebase.

After first successful sign-in, the operator creates a Firestore document at `admins/{uid}` in the Firebase Console using their own Auth UID. Client writes to that collection are forbidden. An empty marker or `active: true` grants the role to a verified member. `active: false` and malformed nonboolean active fields deny authority in both client and deployed backend rules. Sign out/in or use the verification reload control to force refreshed role resolution. No email-based role assignment exists. The agent did not select a user or create an admin marker.

Use a locally installed Java 21 and Playwright Chromium. This managed workspace uses `/usr/bin/java` and an npm-provided Chromium at `/tmp/chromium`; these temporary paths are not portable. Use a bounded Java heap and single browser/test worker. Do not kill unrelated processes or run multiple heavy suites simultaneously. Auth 9099, Firestore 8080, emulator hub 4400 and preview 4173 must be free before claiming them.

```sh
JAVA_TOOL_OPTIONS=-Xmx512m npx firebase emulators:exec --project shared-presentations --only firestore 'npx vitest run tests/auth tests/data tests/rules --maxWorkers=1'
npm run test:upload -- --maxWorkers=1
npx vitest run tests/viewer tests/library-admin tests/ui --maxWorkers=1
EVIDENCE_DIR=/absolute/ignored/evidence npm run test:e2e -- --workers=1
npm run lint
npm run build
node scripts/check-release.mjs
```

The original refresh did not deploy live Firebase; a later explicit user instruction authorized the Firestore-only deployment recorded above. Published metadata and chunks require membership in the deployed rules; the old rules allowed anonymous published reads. Future releases require user authorization, local gates, external verification and a secret scan. Do not infer publication permission from passing tests. The following commands describe the deployment order; only the Firestore rules step has been executed in this session:

```sh
npx -y --engine-strict=false firebase-tools deploy --project shared-presentations --only firestore:rules
npx -y --engine-strict=false firebase-tools deploy --project shared-presentations --only firestore:indexes
npx -y --engine-strict=false firebase-tools deploy --project shared-presentations --only hosting
```

Validate the Hosting URL, all six direct links/reloads, immutable asset caching, HTML cache policy, actual response CSP, Google OAuth and mail on the deployed origin. Local Vite does not apply Firebase Hosting headers. Check iframe isolation under that CSP, keyboard/fullscreen behavior and target browsers/devices manually. Hosting smoke tests and deployment are pending manual approval.

The app replaces the frozen provider's asynchronous composition with a generation-checked boundary. Membership requires a refreshed current-user token with Google sign-in provider or verified-email claim before features mount. Current confirmed role feeds stable data/admin getters. Account/route/role transitions dispose registered listeners and remount the badge. Already-sent SDK/profile writes cannot be recalled; late UI results and navigation are suppressed. The frozen signup service catches verification-mail dispatch errors, so signup completion does not certify mail delivery; the unverified screen offers explicit resend with an honest result.

For application Chromium acceptance, run `npm run build` before the single-worker Playwright command. The suite owns Vite development port 4173 for explicit DI harness tests and ephemeral loopback previews for built production smoke/prepaint, closing them on completion. Set `EVIDENCE_DIR` to an ignored absolute evidence directory to retain the JSON result, payload summaries, failed traces and per-test attempted/blocked browser transport. Do not rename or import the seven-test Node auth suite into Playwright. No live Firebase network transport is permitted in either browser scenario.

The 30 Chromium tests include the original twelve functional scenarios and eighteen L09c scenarios. The visual suite writes eight `matrix-{normal|stress}-{375|1280}-{light|dark}.json` manifests and 80 PNGs under `screenshots/`. Normal states include seven route variants, HTML information, unverified/error states, login/signup/reset, reject-required and delete/unpublish confirmations; stress states include long metadata and a 960-character reject note. Each row records route, state, role, viewport, theme, DPR, PNG hash and document/panel/control bounds. Screenshots capture the 900px viewport without masks or injected CSS; ordinary pages scroll vertically and viewer information panels scroll within their layout. Keyboard and theme JSON records distinguish actual provider fixtures from the actual built index with its emitted module paused for prepaint inspection. Keep failed diagnostic artifacts alongside final results; check counts and exits in the exact-commit handoff before claiming acceptance.
