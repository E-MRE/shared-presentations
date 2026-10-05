# Operations

All Firebase CLI commands must include `--project shared-presentations`, in addition to the committed `.firebaserc` selection. Public Firebase web configuration is committed; it is not an administrator credential. No credentials, real administrator identities, email addresses or UID values should be copied into logs or committed documentation.

Enable Google and Email/Password in Firebase Authentication providers. Configure the production Hosting hostname in Authentication authorized domains. Google OAuth popup, provider consent, account selection, verification mail delivery, password-reset mail delivery and mobile popup behavior require human acceptance using the approved project. Production tests in this lane do not contact live Firebase.

After first successful sign-in, the operator creates a Firestore document at `admins/{uid}` in the Firebase Console using their own Auth UID. Client writes to that collection are forbidden. An empty marker grants the role; an `active: false` marker is treated as revoked by the client. Existing backend rules use document existence, so delete the marker to revoke backend authority. Sign out/in or use the verification reload control to force refreshed role resolution. No email-based role assignment exists.

Portable runtime paths in this environment are `/opt/data/jdk-21` and `/opt/data/ms-playwright`. Use a bounded Java heap and single browser/test worker. Do not kill unrelated processes or run multiple heavy suites simultaneously. Auth 9099, Firestore 8080, emulator hub 4400 and preview 4173 must be free before claiming them.

```sh
JAVA_HOME=/opt/data/jdk-21 PATH=/opt/data/jdk-21/bin:$PATH JAVA_TOOL_OPTIONS=-Xmx512m npx -y --engine-strict=false firebase-tools emulators:exec --project shared-presentations --only firestore 'npx vitest run tests/auth tests/data tests/rules --maxWorkers=1'
PLAYWRIGHT_BROWSERS_PATH=/opt/data/ms-playwright npm run test:upload -- --maxWorkers=1
PLAYWRIGHT_BROWSERS_PATH=/opt/data/ms-playwright npx vitest run tests/viewer tests/library-admin tests/ui --maxWorkers=1
PLAYWRIGHT_BROWSERS_PATH=/opt/data/ms-playwright EVIDENCE_DIR=/absolute/ignored/evidence npm run test:e2e -- --workers=1
npm run lint
npm run build
node scripts/check-release.mjs
```

The current rules/indexes deployment recorded by the orchestrator is historical. A new release requires a separately approved exact commit, fresh local gates, external verification and a secret scan. Do not infer permission to push or deploy from local test results. Deploy rules first, then approved indexes, then Hosting, using separate approval gates. The following commands are reviewable release instructions, not commands executed in this lane:

```sh
npx -y --engine-strict=false firebase-tools deploy --project shared-presentations --only firestore:rules
npx -y --engine-strict=false firebase-tools deploy --project shared-presentations --only firestore:indexes
npx -y --engine-strict=false firebase-tools deploy --project shared-presentations --only hosting
```

Validate the Hosting URL, all six direct links/reloads, immutable asset caching, HTML cache policy, actual response CSP, Google OAuth and mail on the deployed origin. Local Vite does not apply Firebase Hosting headers. Check iframe isolation under that CSP, keyboard/fullscreen behavior and target browsers/devices manually. Hosting smoke tests and deployment are pending manual approval.

The app replaces the frozen provider's asynchronous composition with a generation-checked boundary. Membership requires a refreshed current-user token with Google sign-in provider or verified-email claim before features mount. Current confirmed role feeds stable data/admin getters. Account/route/role transitions dispose registered listeners and remount the badge. Already-sent SDK/profile writes cannot be recalled; late UI results and navigation are suppressed. The frozen signup service catches verification-mail dispatch errors, so signup completion does not certify mail delivery; the unverified screen offers explicit resend with an honest result.
