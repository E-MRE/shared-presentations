# Vektör — RUN 1 planı

## 1. Hedef, kapsam ve kapsam dışı

Hedef: Türkçe Vektör ekip sunum kütüphanesini Vite + React + TypeScript, React Router ve modular Firebase Auth/Firestore ile kurmak. Gerçek Google/e-mail auth, verified üyelik, HTML/PPTX yükleme, admin incelemesi, published feed, own decks/edit, sandbox theater ve PPTX download kapsam içindedir. Browser processing ve Firestore Bytes chunks kullanılır; ücretli server gerekmez. Uygulama kodu, yorumlar, commit ve uygulama dokümanları İngilizce; operatör planı Türkçedir.

RUN 1 yalnızca plan üretir: sıfır worker, uygulama kodu, branch/worktree, deploy, push ve Telegram gönderimi. Yalnızca `docs/PLAN.md` ile `.orchestra/STATUS.md` yazılır. RUN 2, kullanıcı plan onayı ve ilgili belirsizliklerin cevaplanması sonrasında başlar.

Kapsam dışı: Firebase Storage/SQL Connect, ücretli backend/plan, fake/localStorage login, ziyaretçiye deck erişimi, category/slide count/duration, live card iframe, slide bridge/prev-next, admin e-mail ile yetkilendirme, uploaded-content iframe'inde `allow-same-origin`/`allow-popups`. PPTX render edilmez; detay ve indirme sağlanır.

İncelenen başlangıç: `main`, base `0f5f3607b759fe315f470470cddacf0be4ffb974`; yalnızca `LICENSE` tracked. `design/`, `docs/BRIEF.md`, `docs/reference/` ve eski plan untracked; package/application/Firebase config yok. Tek worktree ana repo, ek branch yok. BRIEF bütünü, MASTER/tokens, HTML/CSS/JS referansı, dört deck fixture'ı, reference README ve seçilmiş screenshots incelendi. RUN 2 baseline commit'i untracked kaynakları kontrollü olarak içermelidir; worker worktree'lerinde kendiliğinden bulunacakları varsayılmaz.

## 2. Routing kararı

Dayanak: `codex-orchestrator` skill'i, `/opt/data/.codex/orchestration-suite/references/decision-policy.md`, dependency/evidence/handoff politikaları.

- RUN 1 **O0/L0, direct, sequential**: tek orchestrator plan üretir; worker yasağı uygulanır.
- RUN 2 **O3**: contracts freeze sonrasında ayrı modüllerde auth/data, content ve UI işlerinin paralelliği anlamlı throughput sağlar; bağımsızlık kapısı geçmezse O2/sıralı.
- Verification **L4 rules/veri bütünlüğü; L3 runtime/UI/viewer; L2 foundation**: güvenlik ve atomik veri sınırları güçlü kanıt, etkileşimler runtime kanıtı gerektirir.
- Difficulty **hard** security/data/bundler için, **standard** sınırlı UI/port için: worker kabiliyeti yalnız gerekli lane'de yükseltilir.
- Parallelism **önce sıralı, sonra en fazla iki worker ve bir heavy slot**: yaklaşık 2 GB kullanılabilir RAM ve ortak runtime kaynakları sınırlayıcıdır.

Jev `decision.jev.enabled=true`. `check_brief.py`, mevcut taslakla `--campaign vektor-run1 --lane campaign --executor codex-fleet` için bir kez çalıştırıldı, **exit 0**. Anahtar yazdırılmadı/loglanmadı. İki dosyalık yazma sınırı için script'in `log` fonksiyonu yalnız çağrı belleğinde tutuldu; script dosyası değiştirilmedi ve telemetry dosyası oluşturulmadı. Sonuç:

| Boyut | Öneri | Confidence | Probabilities |
|---|---|---:|---|
| orchestration | abstain; selected O2 | 0.32 | O0=.28, O1=.13, O2=.49, O3=.10 |
| verification | abstain; selected L4 | 0.33 | L0=.06, L1=.08, L2=.15, L3=.25, L4=.46 |
| difficulty | hard | 0.79 | simple=.05, standard=.09, hard=.86 |
| parallelism | abstain; selected no | 0.13 | yes=.44, no=.56 |

Confidence floor .60: `hard` önerisi kabul edildi; diğer boyutlarda kendi kararım kullanıldı. Model tiers: standard `gpt-6-luna:high`, hard `gpt-6.1-sol:high`; gerekirse mekanik simple iş `gpt-6-luna:high`. `ultra` kullanılmaz. Jev yeniden denenmez.

Orchestrator kontrolleri `orchestrator self-check` olarak kaydedilir. L2+ fresh-context nihai değerlendirme dış Hermes/Clementine oturumuna aittir; verify lane/verifier worker oluşturulmaz. L3 runtime; L4 ayrıca izin, concurrency, quota ve veri bütünlüğü negatif kontrollerini içerir. Eksik kanıt PASS sayılmaz. Full brief/handoff L3/L4; L2 standard evidence. Her RUN 2 dispatch öncesi budget gate ve gerekli file/resource claims kontrol edilir. İki başarısız review round sonrasında otomatik tekrar durur; deterministik kanıtla yalnız ilgili difficulty/L/O boyutu yeniden değerlendirilir.

## 3. Lane listesi

Tüm lane'ler RUN 2 içindir; hiçbiri başlatılmadı. `**` yalnız belirtilen dizinin tüm dosyalarını kapsar. Listede olmayan uygulama dosyası yazılamaz. Global CSS, package/lockfile ve shared contracts tek sahiptedir. Contract eksikliği sahip lane'e geri döner; tüketiciler durur, değişiklik sıralı merge edilir. Source fixture'ları salt okunur girdidir.

| ID / branch | Başlık ve objective | Tam write scope | Önce merge edilecek lane'ler | Fleet / difficulty / L | Paralel grup |
|---|---|---|---|---|---:|
| L01 / `work/foundation` | Foundation: baseline, toolchain, CSS portu, pre-paint theme ve Hosting iskeleti | `.gitignore`, `.firebaserc`, `firebase.json`, `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `vitest.config.ts`, `src/vite-env.d.ts`, `src/styles/**`, `src/routing/routes.ts`, `public/**`; mevcut `design/**`, `docs/BRIEF.md`, `docs/reference/**` ilk commit'e eklenir, içerikleri değiştirilmez | Yok; operator gate gerekir | codex-fleet / standard / L2 | 1 |
| L02 / `work/security-contracts` | Security contracts: şema, quota, rules/indexes ve API contracts kanıtı/freeze | `src/firebase.ts`, `src/contracts/**`, `firestore.rules`, `firestore.indexes.json`, `tests/rules/**`, `docs/ARCHITECTURE.md` | L01 | codex-fleet / hard / L4 | 2 |
| L03 / `work/auth-data` | Auth & data: gerçek auth, yetkili sorgular, atomik deck/chunk/counter CRUD | `src/auth/**`, `src/data/**`, `src/features/auth/**`, `tests/auth/**`, `tests/data/**` | L01, L02 | codex-fleet / hard / L4 | 3 |
| L04 / `work/content-pipeline` | Content pipeline: folder/zip/html/PPTX doğrulama, bundling, chunks ve auto/override/default cover | `src/content/**`, `tests/content/**` | L01, L02 | codex-fleet / hard / L4 | 3 |
| L05 / `work/shared-ui` | Shared UI: header/layout/card/modal/toast/theme ve erişilebilir ortak davranış | `src/components/**`, `src/layout/**`, `src/theme/**`, `tests/ui/**` | L01, L02 | codex-fleet / standard / L3 | 3 |
| L06 / `work/viewer` | Viewer: `/s/:id`, dark theater/Bilgi/fullscreen/close, PPTX detail/download | `src/features/viewer/**`, `tests/viewer/**` | L03, L04, L05 | codex-fleet / hard / L3 | 4 |
| L07 / `work/library-admin` | Library & admin: feed/search, `/benim`, pending/all status review, live badge ve action modalları | `src/features/library/**`, `src/features/admin/**`, `tests/library-admin/**` | L03, L05 | codex-fleet / standard / L3 | 4 |
| L08 / `work/upload-edit` | Upload & edit: `/yeni`, `/duzenle/:id`, progress/preview, metadata/cover/links/file replacement, re-review | `src/features/editor/**`, `tests/editor/**` | L03, L04, L05 | codex-fleet / hard / L3 | 4 |
| L09 / `work/app-integration` | Integration: router/bootstrap, route E2E/release checks, setup/acceptance docs | `src/main.tsx`, `src/App.tsx`, `src/routing/Router.tsx`, `playwright.config.ts`, `tests/e2e/**`, `scripts/check-release.mjs`, `README.md`, `docs/OPERATIONS.md`, `docs/ACCEPTANCE.md` | L06, L07, L08 | codex-fleet / hard / L3; kritik L4 kanıtı korunur | 5 |

L01 tüm minimal dependencies/test scripts'i baştan tanımlar: Firebase SDK/CLI devDependency, Router, zip/capture, lint/build/unit/rules/Playwright. Sürümler RUN 2'de uyumluluk kontrolüyle lockfile'a sabitlenir; doğrulanmamış latest sürüm numarası verilmez. UI kit/CSS framework eklenmez. UI lane'leri `ui-ux-pro-max` kullanır; onaylı `design/` kararı önceliklidir.

L03 Google login; e-mail signup/verification/resend/token refresh; login/reset/logout; unverified state sağlar. Üyelikten önce Firestore listener açmaz; logout/route değişiminde kapatır. Owner/admin mutation ortak data servisine gider; UI yetkisi rules yerine geçmez.

L04 entry seçimi, relative path normalizasyonu, CSS imports/url(), JS/image/font/srcset inlining, ZIP traversal/expansion limitleri ve unresolved external URL uyarısını kapsar. 300 file/25 MB unpacked/5 MB HTML encoded/8 MB PPTX sınırları herhangi bir write'tan önce doğrulanır. Dört mevcut fixture'a ek zip/PPTX test girdileri kendi `tests/content/**` kapsamındadır.

L07 required reject note için gerçek modal; delete/unpublish için confirm modal kullanır. L08 owner edit'in `pending` sonucu ve yeni pending slot gerektiren değişiklikte quota kontrolünü sağlar. L09 başka lane'in dosyasını düzeltmez; kusur sahibine döner.

**Sequential-only:** L01 ortak root/toolchain/baseline'ı kurar; L02 unresolved schema/security kararının iki tarafını aynı lane'de kanıtlar; L09 tüm çıktıların entegrasyonu ve singleton test ortamını yönetir. Bu üç lane kendi grubunda yalnız yürür. L03–L05 ve L06–L08 ayrı write scopes ile bağımsız merge edilebilir; her branch yalnız merge edilmiş dependency commit'inden açılır. Her lane `work/<name>` worktree branch'inde commit üretir.

Tüm atamalar codex-fleet'tir. Agy/space-bunny gerekmiyor; space-bunny yalnız küçük/net/mekanik iş yeniden ayrılırsa değerlendirilebilir. Availability/auth/quota/no-output engelinde orchestrator fleet politikasına göre reassignment yapıp STATUS'a kaydeder; kalite sorunu fleet fallback nedeni değildir. Worker branch/worktree oluşturamaz, merge/push/deploy yapamaz veya operatöre mesaj atamaz.

## 4. Fazlar, DAG ve kaynak tavanı

1. **P0:** plan onayı, bölüm 7 cevapları ve exclude çözümü; base/dirty-source envanteri. Açık ortak karar varken fan-out yok.
2. **P1 / L01:** kaynak baseline, toolchain/CSS/Hosting. RUN 2'de orchestrator portable JDK 21'i `/opt/data/home/.local` altında; gerekirse Chromium'u operator home cache'inde kurar. Sudo yok.
3. **P2 / L02:** rules/quota/binary testleri, contracts freeze. Rules fizibilitesi başarısızsa fan-out bloke edilir. Dış review ve ayrı Telegram onayından sonra ilk gerçek rules deploy'u bu noktadan itibaren talep edilebilir; hosting önce deploy edilemez.
4. **P3 / grup 3:** L03 + L04; boşalan slotta L05. Aynı anda en fazla iki worker.
5. **P4 / grup 4:** L06 + L08 öncelikli; boşalan slot L07. L07 dependency'leri merge edilmişse daha erken başlayabilir. Her başlama için claims ve heavy slot kapısı uygulanır.
6. **P5 / L09:** integration; build/lint/unit, rules ve browser checks sıralı; orchestrator self-check ve dış Hermes/Clementine fresh-context kabulü.
7. **P6:** ilk deploy gerçek rules, sonra onaylı indexes/hosting; canlı auth/manual kabul, onaylı main push, cleanup ve dış son kontrol.

DAG: `L01 → L02 → {L03,L04,L05}`; `{L03,L04,L05} → L06`; `{L03,L05} → L07`; `{L03,L04,L05} → L08`; `{L06,L07,L08} → L09 → release`.

Planlanan **kritik yol: L01 → L02 → L04 → L08 → L09 → rules/hosting/live acceptance**. L03/L05 zorunlu diğer girdiler; viewer gecikirse kritik yol L06'ya kayar. Ölçülmeden kesin saat tahmini verilmez; release onay beklemeleri yolun parçasıdır.

RAM yaklaşık 3.8 GB toplam/2 GB kullanılabilir, swap yok. **Heavy concurrency = 1:** npm install/ci/build, Java emulator veya Chromium test/capture işinden yalnız biri ağır kaynak sahibi. Worker concurrency = 2; browser workers = 1. Java ve Chromium ayrı ağır işler olarak birlikte çalıştırılmaz. Emulator+browser gerektiren tek integration job ancak sınırlı heap/tek browser ve ölçülmüş RAM ile çalışır; sığmıyorsa operator makinesine taşınır. İkinci worker yalnız hafif code/static iş yapar. Port/dev server/emulator singleton sahipliği claim edilir; RAM azalırsa toplam worker sayısı bire iner.

## 5. Paralellik öncesi dondurulacak contracts

| Contract / sahibi | Freeze kapsamı | Tüketiciler |
|---|---|---|
| Design tokens/CSS / L01 | `src/styles/tokens.css`, `src/styles/styles.css`: primitive→semantic→component, onaylı palette, Plus Jakarta Sans + JetBrains Mono, class/layout portu, SVG, focus-visible, reduced-motion, AA minimum, theater dark tokens | L03–L09 |
| Route table / L01 | `src/routing/routes.ts`: `/`, `/benim`, `/yeni`, `/duzenle/:id`, `/admin`, `/s/:id`; member/admin/owner gates, deep-link/not-found/back; Router implementation L09'a ait | L03, L05–L09 |
| Data model + rules + indexes / L02 | users/admins/presentations/chunks schema, whitelist/types/status/immutable owner, quota/byte manifest, rules-query uyumu, composite indexes/binary index exemptions | L03, L04, L06–L09 |
| `firebase.json` / L01 | `.firebaserc default=shared-presentations`; SPA rewrite, hashed asset long-cache, index no-cache, nosniff/referrer/CSP/frame-ancestors; emulator ports ve explicit CLI project | L02, L04, L06, L09 |
| Shared TS/API types / L02 | `src/contracts/**`: Deck/Status/Kind/Link, AuthState, data-service inputs/results, query pagination, PreparedContent/cover/chunk manifest, limits/error codes | L03–L09 |
| Chunk format / L02 | Versioned manifest, canonical decimal chunk IDs, Bytes/no-base64, chunk ≤900,000 byte/count ≤12, HTML gzip/PPTX identity, ordered reassembly, byte manifest ve bounded decode | L03, L04, L06, L08, L09 |
| Frame/capture / L02 | Theater/upload preview tam `allow-scripts allow-fullscreen`; hidden capture tam `allow-scripts`; srcdoc/blob ve CSP POC; source/schema/size-validated capture messages, same-origin/popups/slide bridge yok | L04, L06, L08, L09 |

Data model BRIEF alanlarını korur: `users/{uid}` profile/createdAt/pendingCount; Console-only `admins/{uid}`; `presentations/{id}` owner identity, title/description/links/kind/fileName/status/rejectNote/cover/coverSource, sizes/fileCount/chunkCount, createdAt/updatedAt/publishedAt/reviewedBy/reviewedAt; `chunks/{index}` index/data. L02 gerekli format/manifest ve mutation binding alanlarını belgeler.

Rules: üye = signed in ve Google veya verified e-mail. Published + own read; admin review için all decks read; başka üyenin non-published deck/chunk erişimi denied. User kayıtları gereksiz listelenmez; admin doc client-write denied. Owner create/edit pending; yalnız admin review/status ve published delete. Whitelist/types/owner immutability, links ≤10 ve https, title ≤120/description ≤2000, cover hedef ≤100 KB/rules cap 150,000 byte; kalan her izin denied. Açılmış içerik limitlerinin gerçek server enforcement sınırı bölüm 7'de netleştirilir.

Quota contract yalnız `pendingCount + 1` kontrolüne dayanmaz: L02, tek deck mutation'ını counter değişimine bağlayan marker veya eşdeğer kanıtlı şema seçer. User/counter ve deck geçişi iki yönde `getAfter()` ile bağlanır; birden fazla deck'in tek increment ile oluşturulması engellenir. Pending→pending edit counter artırmaz; pending'den çıkış/delete azaltır; başka status→pending yeni slot gerektirir. Counter/role spoofing, concurrency ve drift test edilir. Chunk Bytes gerçek uzunlukları manifest'e bağlanır; toplam encoded boyut, index/range/write yetkisi doğrulanır. Deck/chunks/counter atomik yazılır; replacement tail ve delete orphan temizliği gerekir. Rules access-call ve transaction request bütçesi runtime kanıtı olmadan freeze edilmez.

Queries/indexes: published feed `status + publishedAt desc`; own `ownerUid + updatedAt desc`; queue `status + createdAt asc`. Binary cover/chunks için index exemptions, cursor pagination; chunk'lar yalnız view/download'da. Search title/description/author üzerinde client-side; tüm arşiv veya yüklenen sayfalar kararı bölüm 7'de netleşir.

Theme: head inline pre-paint script, tüm storage işlemleri try/catch; stored choice yoksa prefers-color-scheme; html data-theme ve color-scheme birlikte. Theater her temada dark. Reference'ın forbidden işlevleri port edilmez.

Capture: load/fonts dahil yaklaşık 8s deadline, ilk viewport 16:9; source iframe window + payload/size doğrulanır, opaque origin için yalnız origin kontrolü yetmez. Parent raster decode/resize ile 640px WebP/JPEG üretir; timeout/PPTX/failure uploaded/default cover'a düşer. Capture helper yalnız geçici render'a eklenir. L02 browser POC, CSP/srcdoc/blob davranışını freeze eder; gerekli `firebase.json` değişikliğini L01 sıralı yapar. Sandbox string korunur; `allow-fullscreen` token'ı standart fullscreen izni yerine varsayılmaz, parent chrome fullscreen API ve gerekiyorsa ayrı allow/allowfullscreen attribute test edilir. F/Esc focus ve external resource davranışı kullanıcı cevabından sonra dondurulur.

## 6. Riskler ve fallback

| Risk | Olasılık / etki | Azaltma | Bloke ederse fallback |
|---|---|---|---|
| JDK 21 / Firestore emulator | Yüksek: Java bulunmadı; rules runtime kanıtı alınamaz | RUN 2'de portable JDK 21, `/opt/data/home/.local`, task-specific JAVA_HOME/PATH, checksum/version kontrolü; tek emulator ve bounded heap | Uyumlu operator/CI ortamında aynı rules suite; geçmeden security merge/deploy yok; static inceleme PASS değildir |
| Node 26 / engine-strict Firebase CLI | Orta-yüksek: Node v26.5.1; engine/runtime uyumsuzluğu install/emulator'u durdurabilir | L01 Firebase CLI devDependency/lockfile; tüm çağrılarda `npx -y --engine-strict=false firebase-tools ... --project shared-presentations`, writable cwd. İncelemede npm engine-strict false çıktı; BRIEF'in true uyarısına karşı override yine korunur | Node 24 portable runtime ile tekrar; global npm policy değiştirilmez, sahte test başarısı yazılmaz |
| Playwright/Chromium availability | Yüksek: çalışabilir browser kanıtlanmadı; screenshot/CSP/E2E eksik kalır | RUN 2'de Playwright + Chromium kurulumu/smoke, dependency uygunluğu; workers=1, server port claim | Operator makinesinde aynı E2E + manual screenshots; ortamda skip ve nedeni yazılır, browser kabulü tamamlanmadan PASS verilmez |
| Yaklaşık 8s cover capture | Orta-yüksek: font/network/canvas/WebGL veya opaque origin capture sorunları | Deadline load/fonts aşamasını kapsar; helper timeout, listener/frame cleanup, source/payload/size validation; 640px/~100 KB cover | Uploaded image veya title-on-brand default; kullanıcı override. UI açıklaması; JS event-loop kilidi için timer kesin hard isolation garantisi sayılmaz |
| Firestore Spark | Orta: 1 GiB storage / 50k reads / 20k writes günlük; quotas aşılırsa servis durur | Pagination, binary index exemptions, chunk'ları yalnız izleme/indirmede okuma, bounded subscriptions/cache, search read bütçesi, Usage takibi; otomatik view-count write yok | Yeni upload durdurma/Türkçe quota hatası, operator kontrollü arşiv temizliği; ücretli plana/server'a sessiz geçiş yok |
| İlk deploy gerçek rules | Kesin gereklilik; yanlış sıra açık test-mode database'i exposed bırakır | İlk deploy yalnız reviewed/tested rules; explicit project, commit/hash ve command ile Telegram approval; hosting/indexes önce deploy edilmez | Onay/test yoksa deploy yapılmaz; acil containment gerekiyorsa ayrı onaylı deny-all rules-only seçeneği; open test rules'a rollback yok |
| srcdoc sandbox + CSP | Yüksek: inherited CSP inline deck/capture scripts, fonts/data URI'leri engelleyebilir | L02 gerçek browser POC; L01 shell headers, auth/network kaynakları ve srcdoc/blob behavior birlikte değerlendirilir; isolation invariant korunur | BRIEF izin verdiği blob URL yolu, cleanup/revoke; yeterli güvenli çözüm yoksa contract fan-out'u durur ve kullanıcıya seçenek sunulur |
| Public repo / admin identity | Kesin public repo; yanlış commit identity/secret sızdırabilir | Admin role yalnız Console `admins/{uid}`; public Firebase config dışında secret yok; code/docs/screenshots/artifacts diff taraması, gerçek admin e-mail committed code'a girmez; fake login port edilmez | Hassas dosya commit dışı tutulur; kaynak maskelenmesi gerekiyorsa izin/scope revizyonu. Commit öncesi düzeltme; credential sızmışsa rotate ve operator bildirimi |
| Quota/counter/chunk integrity | Yüksek etki: atomic görünen write yanlış counter, orphan veya forged size üretebilir | L02/L03 L4, concurrent upload/edit/review/delete, forged metadata, extra/missing chunks ve rule access-call bütçesi; L04 bounded unpack/decode | Şema/transaction sözleşmesini sahip lane'de yeniden kurma; invariants kanıtlanmadan merge/deploy yok |
| Untracked source baseline | Kesin: worker worktree kaynakları eksik olabilir | L01 explicit source import, plan/status hariç; public içerik kontrolü; tüm worker'lar baseline commit'inden | Kaynakların public commit'i istenmezse operator onaylı ayrı read-only resource mount/copy planı; eksik kaynakla worker dispatch yok |
| Live Auth / Console kurulumu | Orta: emulator Google OAuth/mail delivery'yi kanıtlamaz | Operator Google + e-mail/password provider ve authorized Hosting domains kontrolü; ilk gerçek sign-in sonrası UID doc setup | Emulator kanıtı korunur, canlı acceptance BLOCKED; gerçek kullanıcı mail/OAuth deneyimi gelmeden tamamlandı denmez |

Firestore document/request/rules access-call limitleri, manifest ve atomic batch tasarımının teknik kapısıdır; bütün chunk'ları tek parent rule'dan okumak bütçeyi aşabilir. L02 bu sınırları hesaplayıp emulator kanıtı üretir. Spark kotası ve limitler [Firebase quotas](https://firebase.google.com/docs/firestore/quotas), atomic `getAfter()`/rules-query davranışı [Firebase rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions) ile kontrol edildi. Sandbox/fullscreen attribute ayrımı [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe) kaynağıyla kontrol edildi.

## 7. Kullanıcının onayladığı bağlayıcı kararlar

Operator planı onayladı; yedi soru cevaplandı. RUN 2 yalnız L01 ile sınırlıdır; aşağıdaki kararlar eski açık soru/contract ifadelerinin yerine geçer.

1. **Git/exclude:** `docs/PLAN.md` commit edilecek. Operator `.orchestra/` dizinini `.git/info/exclude` içine ekledi; ignored olduğu kontrol edildi. Exclude dosyası tekrar değiştirilmeyecek.
2. **Palette/fonts:** Çalışan `design/css/tokens.css` graphite/white palette ve blue accent kazanır. MASTER indigo değerleri kullanılmaz. Fonts Plus Jakarta Sans + JetBrains Mono.
3. **Limits split:** Rules yalnız compressed size, chunk count, field types/sizes enforce eder. Unpacked size ve file count browser-only kontrol edilir; backend eklenmez, rules bunları doğrulamaya çalışmaz.
4. **F/Esc focus:** Fullscreen/close yalnız app UI focus'tayken çalışır. Her iki button daima görünür. Iframe'e ek keyboard/control helper veya message/slide bridge eklenmez.
5. **Owner delete:** Owner kendi pending/rejected/unpublished deck'ini silebilir. Published delete admin-only.
6. **Search:** Published deck metadata bir kez yüklenir; content/chunks yüklenmez. Title/description/author browser search; Firestore full-text veya per-keystroke query yok.
7. **External HTTPS/CSP:** Unresolved external HTTPS kaynakları uyarıyla kabul edilir. L01 srcdoc iframe'in app CSP'yi miras aldığını browser'da kontrol eder ve `firebase.json` CSP headers'ı buna göre ayarlar.

RUN 2 execution override: L01 O3/L2/standard/sequential-single, tek codex-fleet CLI worker ve tek review round hedefi; standard reasoning effort `high`, `xhigh` değil. L01 scope'una operator tarafından `playwright.config.ts` ve bu plan kararlarının commit'i eklendi. Build/lint/CSP kanıtı zorunlu. Local merge ve cleanup sonrası STOP; L02 veya başka lane başlatılmaz. Deploy ve remote main update için ayrı Telegram approval verilmedi.

## 8. BRIEF §8 kabul eşlemesi

| # | Kabul | Lane | Kontrol ve kanıt |
|---:|---|---|---|
| 1 | Build/lint/rules/bundler-upload tests temiz | L01–L04, L08, L09 | Otomatik: `npm run build`, `npm run lint`, `npm run test:unit`, `npm run test:rules`, `npm run test:upload`; exit code/log/commit. Unit scripts ilgili lane testlerini kapsar; rules için gerçek emulator gerekir |
| 2 | Rules-first deploy, sonra Hosting URL çalışır | L01, L02, L09 + orchestrator release | Otomatik/self-check: explicit project ve SHA, rules suite, deploy log, Hosting headers/SPA deep links. Manuel: Telegram deploy approval, gerçek URL load; ilk deployment rules-only kanıtı |
| 3 | Google auth/e-mail verification; unverified upload denied | L02, L03, L08, L09 | Otomatik: auth state/UI, forged/unverified rules contexts, resend/reload/token-refresh davranışı. Manuel: gerçek Google login, verification mail/link, reset mail; unverified UI + direct write denial |
| 4 | Dört fixture + zip + PPTX pending/thumbnail; altıncı pending denied | L02–L04, L08, L09 | Otomatik: dört `design/presentations/*.html`, zip/PPTX parser, bounds/cover/Bytes roundtrip, 5→6 quota ve concurrent attempts. Browser/manual: ilk beş HTML input'u (4 fixture+zip), altıncı PPTX reddi; birini review ile quota'dan çıkarıp PPTX'i pending yükle. HTML auto cover source ve görünürlük; capture failure fallback ayrıca sınanır |
| 5 | Non-admin others pending read/status change denied | L02, L03 | Otomatik rules: signed-out/unverified/member/admin, parent+chunks get/list, other-owner edit, status/review/admin-doc spoofing, counter mutation denial. Manuel: operator gerçek non-admin browser Console üzerinden Web SDK read/write denemesi; Firebase Console admin yetkisi rules kanıtı sayılmaz |
| 6 | Approve/feed, required reject note/owner display, unpublish/reapprove/delete | L02, L03, L07, L09 | Otomatik emulator+UI: tüm transitions, modal validation, live badge, counter, delete chunk cleanup. Manuel: iki user/admin oturumu ile queue→feed, `/benim` reject note ve tüm actions |
| 7 | Deck nav/F/fullscreen/Esc/strict sandbox/isolation | L02, L04, L06, L09 | Otomatik browser: iframe sandbox string tam `allow-scripts allow-fullscreen`, deck arrow keys kendi iframe'inde, parent/cookie erişimi denial ve chrome focus/fullscreen behavior. Manuel: gerçek F/Esc/fullscreen, kullanıcı cevabıyla freeze edilmiş odak davranışı; browser olmadan PASS yok |
| 8 | Light/dark/no flash/dark theater ve tüm route screenshots | L01, L05–L09 | Otomatik browser: pre-paint storage success/failure/system preference, reload, reduced-motion/focus, 375px ve desktop. Manuel: `/`, `/benim`, `/yeni`, `/duzenle/:id`, `/admin`, HTML/PPTX `/s/:id`, auth/reject/confirm states için iki tema screenshot; `design/index.html` layout ve onaylı token baseline'ıyla karşılaştırma |
| 9 | Published owner edit yeniden pending | L02, L03, L08, L09 | Otomatik rules/data/UI: metadata/cover/links/file replacement, published→pending/counter, feed removal ve old-tail cleanup; pending edit counter sabit. Manuel: published deck owner edit sonrası `/benim` status ve admin queue |

Planlanan package scripts: `test:unit` bütün unit/component suites; `test:upload` content/editor suites; `test:rules:unit` emulator içindeki rules suite; `test:rules` aşağıdaki emulator wrapper; `test:e2e` tek browser worker. Bunlar RUN 1'de mevcut/çalıştırılmış değildir, L01 tarafından kurulacaktır.

Rules komutu:

```sh
npx -y --engine-strict=false firebase-tools emulators:exec --project shared-presentations --only firestore "npm run test:rules:unit"
```

Clementine final gate, actual diff/artifacts'i BRIEF'e göre fresh context ile inceler; testleri exact merged SHA üzerinde tekrarlar, sonra handoff claims ile karşılaştırır. Screenshot/credentials/browser eksikleri `BLOCKED` olarak açık kalır. Build/lint tek başına auth/security/CSP/live deploy kabulü değildir. İlk sign-in sonrası operator Console'da `admins/{uid}` boş doc oluşturur; kimliği e-mail'den türetilmez. Provider/domain/setup adımları L09 `docs/OPERATIONS.md` içinde İngilizce yer alır.

## 9. Git, PR, merge ve onay politikası

RUN 1 Git metadata/branch/commit/worktree değiştirmedi; RUN 2 yalnız L01 için yerel Git işlemleri yapar. PLAN operator kararıyla commit edilir; STATUS ve `.orchestra/` commit edilmez. Mevcut exclude eksikliği bölüm 7'de açık; yalnız iki dosyalık izin gereği otomatik düzeltilmedi. RUN 2 başlamadan operator `.git/info/exclude` için `/docs/PLAN.md`, `/.orchestra/`, `/.orchestration/` satırlarını eklemeli veya açık yerel metadata istisnası vermelidir. `.gitignore` bu özel planı public commit'e taşımak için kullanılmaz.

RUN 2'de orchestrator baseline import'u ve scope kayıtlarını yönetir. Her paralel worker'a bir worktree, branch `work/<name>`, cwd `../shared-presentations-wt-<name>`; sırayla çalışan lane'ler için de aynı izolasyon tercih edilir. Komut şablonu, yalnız RUN 2'de:

```sh
git worktree add ../shared-presentations-wt-<name> -b work/<name>
```

Worker yalnız kendi scope'una commit eder. Orchestrator diff/scope/tests/handoff kontrolünden sonra merge eder; worker merge/push yapamaz. Yerel `main` entegrasyonunda remote `main` onaysız değişmez. PR yayını operator/orchestrator tarafından `hermes/<lane>-<topic>` candidate branch'inden yapılır; source commit SHA ve dependency/base belirtilir. RUN 1 hiçbir remote yazımı yapmaz. PR branch push'u yalnız RUN 2'nin onaylı yayın kapsamı varsa yapılır; main PR merge de remote main değişikliği olarak approval gate'e tabidir.

Bir paralel worker'ın lockfile/global contract değiştirmesi yasaktır. Rebase/contract amendment orchestrator koordinasyonunda, ilgili worker bitmiş veya durdurulmuşken yapılır. Commit'ler küçük, lane kapsamına göre İngilizce; public identity/secrets kontrolü merge öncesi yapılır. Eski untracked kaynakları silmek veya mevcut çalışmayı resetlemek yok.

Merge ve evidence sonrası orchestrator her lane için iki temizliği de yapar:

```sh
git worktree remove ../shared-presentations-wt-<name>
git branch -d work/<name>
```

**İki Telegram onay kapısı:**

1. **`firebase deploy`**: tam command/project, tested commit, beklenen değişiklik ve rollback/containment seçeneği gönderilir; operator cevabı gelmeden çalışmaz. Plan onayı deploy onayı değildir. İlk deploy:

```sh
npx -y --engine-strict=false firebase-tools deploy --only firestore:rules --project shared-presentations
```

Rules-first kanıtı ve ayrı/explicit approval kapsamından sonra indexes, ardından hosting:

```sh
npx -y --engine-strict=false firebase-tools deploy --only firestore:indexes --project shared-presentations
npx -y --engine-strict=false firebase-tools deploy --only hosting --project shared-presentations
```

2. **`git push` to `main` / PR merge into remote main**: exact commit/diff, checks ve public-content kontrolü ile Telegram approval; workers asla push yapmaz. Onaylı push command'i orchestrator uygular.

Tüm Firebase CLI çağrıları yalnız `shared-presentations` ve explicit `--project shared-presentations`; login'in diğer projeleri kapsam dışıdır. Test verileri emulator'da; canlı mevcut veriler için önce read-only envanter, otomatik migration/delete yok.

Milestone mesajları (merge/PR, deploy request, blocker/final) operator-facing Hermes'e devredilir; bu RUN 1'de Codex Telegram'a göndermez. `.orchestra/STATUS.md` kararları/kanıtları taşır. Final `VERIFY`: exact commands, expected branch/final SHA, base, bütün worker commit'leri ve lane dışı orchestrator commit'leri gerekçeleri, gerçek cleanup/tree sonucu. Temizlik yapılmadan “tree clean” iddiası yok. Dış son doğrulama Clementine'ye aittir; verifier worker yok.

## 10. RUN 2 başlangıcı ve kesin resume komutu

RUN 2 önce kullanıcı Telegram plan onayını ve bölüm 7 cevaplarını okur; cevapları STATUS'a kaydeder. İlgili architecture soruları açıkken worker başlatmaz. Onay yalnız gelecekteki uygulama kapsamını açar; deploy ve main push ayrı gate'lerde kalır.

Başlangıç sırası: izinli dosyaları exclude çözümü; repo/base/untracked-source kontrolü; onaylı palette/search/network/focus/owner-delete/limit kararlarının contract'a geçirilmesi; L01 scope ve baseline worktree hazırlığı; package toolchain/dependency uyumluluğu; portable JDK/Chromium availability preflight; sonra L02 security proof/freeze. Her lane dispatch'i öncesi English bounded brief, exact write scope, merged dependency SHA, fleet/model/effort, verification/evidence ve file/resource claims verilir; budget gate geçmeden dispatch yok. Fan-out yalnız L02 merge/freeze sonrasında.

Aşağıdaki komut kullanıcı tarafından verilen syntax/session id ile sabittir; RUN 1'de çalıştırılmaz. Prompt'taki cevap listesi gerçek Telegram cevaplarıyla doldurulmadan implementation authorization varsayılmaz. Aynı session UUID kullanılır; `--last` ile başka oturum seçilmez.

```sh
codex exec resume -c model_reasoning_effort="medium" -c model_reasoning_summary="auto" 01a0fbe6-c542-7572-b190-6fd90149b683 "RUN 2: Read docs/PLAN.md and .orchestra/STATUS.md. Apply the following actual Telegram approval and answers: [paste operator approval and answers to section 7]. If approval or a required contract answer is missing, remain in plan mode and report the missing decision. Otherwise act as codex-orchestrator in full mode, begin with the approved preflight and L01 baseline, then L02 security proof and contract freeze. Use only the approved lane scopes, at most two workers and one heavy job. Never deploy Firebase or push/merge to remote main without separate Telegram approval. Relay milestone updates through the operator-facing Hermes session."
```

RUN 1 tamamlanınca durulur. Bu plan hiçbir worker'ın başladığına, testlerin geçtiğine, dosyaların ignored olduğuna veya deploy/push yapıldığına dair iddia içermez.
