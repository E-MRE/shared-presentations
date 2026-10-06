# Vektör — Son kontrol raporu

6 Ekim 2026. Çalışma kaldığı yerden sürdürüldü. **Yayına hazır değil: uygulama v1 backend paketinde 8 açık sınır hatası var.** Kullanıcının istediği yapısal prototipte 1/6/12 parça ve sekiz etiket geçti; ek on bağlantı kombinasyonu başarısız. Canlı deploy, canlı veri veya hesap silme yapılmadı.

Başlangıç commit’i `4e85348950127888cf0bd2045555061ee1294f56`; GitHub `main` aynı referansla doğrulandı. Başlangıç çalışma alanı temizdi. Bu rapor ve mevcut değişiklikler devam için çalışma sürümü olarak kaydedildi; commit bilgisi teslim mesajında verilir.

Önceki duraklatmada limit nedeniyle commit komutu yürütülmemişti; staging oluşmamıştı. Devamda çalışma alanı korundu. İstenen ölçüm ve izole prototip tamamlandı; ürün veri modeline geçiş planı aşağıda bağlantılıdır.

## Komutlar ve sonuçlar

Node `24.21.0`, Java Corretto `21.0.12.1`, Playwright Chromium `153.0.8010.12` kuruldu. Araçlar geçici dizinlerde: `/private/tmp/vektor-node24`, `/private/tmp/vektor-java21`, `/private/tmp/vektor-playwright`. Node 23 ile ilk kurulum engine uyarısı verdi; kilitli Vitest 5 Node 20/23 desteklemiyor. `.nvmrc` ve package/lock engine sözleşmesi desteklenen sürümlere güncellendi; Node 24 ile `npm ci` tekrar geçti.

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| `npm ci` | Geçti; Node 24 ile kilit dosyasından tekrar kuruldu | `test-results/son-kontrol/npm-ci-node24.log`, `npm-ci-final.log` |
| `npx playwright install chromium` | Resmi indirme tamamlandı | `test-results/son-kontrol/chromium-install.log` |
| `npm run lint` | Geçti | [lint](kanit/son-kontrol-2026-10-06/lint.txt) |
| `npm run build` | Geçti | [build](kanit/son-kontrol-2026-10-06/build.txt) |
| `npm run test:unit -- --maxWorkers=1` | 192 geçti, 105 skip; backend/prototip emülatör senaryoları ayrı çalıştırıldı | [birim sonuçları](kanit/son-kontrol-2026-10-06/unit.json) |
| `npm run test:e2e -- --workers=1` | 35 geçti; 60 saniye kilidi dahil | [E2E sonuçları](kanit/son-kontrol-2026-10-06/e2e.json) |
| `npm run check:release` | Yerel kontrol geçti; canlı kabul yerine geçmez | [release](kanit/son-kontrol-2026-10-06/release.txt) |
| `npm run test:backend` | İlk mevcut paket 103/103 geçti. Genişletilmiş güncel paket **131 geçti, 8 başarısız, 0 skip** | [son backend sonuçları](kanit/son-kontrol-2026-10-06/backend.json) |
| `npm run test:manifest-prototype` | **22 geçti, 1 başarısız, 0 skip**; istenen 1/6/12 parça geçti; 8 etiket + 10 bağlantı açık | [prototip sonuçları](kanit/son-kontrol-2026-10-06/manifest-prototype.json) |
| `npm audit --omit=dev --json` | Üretim bağımlılıklarında 0 bulgu | [üretim audit](kanit/son-kontrol-2026-10-06/npm-audit-production.json) |
| `npm audit --json` | Geliştirme CLI zincirinde 3 high; açık | [tam audit](kanit/son-kontrol-2026-10-06/npm-audit.json) |

Lint/build/release devam oturumunda tekrar geçti. Skip sonuçları başarı sayılmadı: birim paketinde atlanan backend senaryoları ayrı emülatör komutunda çalıştırıldı. Önceki 47 kontrol de gerçekten geçti. Prototip ürün servisinin yerine ayrı demo fixture ve gerçek SDK transaction kullanır; uygulama düzelmiş sayılmadı.

Ham loglar, ekranlar ve tam JSON sonuçları `test-results/son-kontrol/` altında korunuyor. Git’e taşınan kalıcı özetler `docs/kanit/son-kontrol-2026-10-06/` içindedir; [SHA256SUMS](kanit/son-kontrol-2026-10-06/SHA256SUMS) kanıt dosyalarının hash’lerini içerir. Emülatörün otomatik yazdığı action bağlantıları kalıcı kanıtlara alınmadı.

## Backend ve izolasyon kanıtı

`test:backend` yalnız `demo-shared-presentations` projesini kullanıyor. Her iki emülatörün loopback adresi zorunlu; yoksa komut hata verir. Sonuç doğrulayıcı herhangi bir skip/pending/fail durumunda başarı üretmez. Varsayılan SDK singletons da backend testlerinde demo emülatörlerine bağlanıyor.

[Emülatör hedefleri](kanit/son-kontrol-2026-10-06/emulator-targets.json), [gerçek socket hedefleri](kanit/son-kontrol-2026-10-06/socket-targets.jsonl) ve [emülatörsüz negatif kontrol](kanit/son-kontrol-2026-10-06/missing-emulators.txt) kayıtlı. SDK socket guard yerel dışı bağlantıyı açılmadan engeller; `firestore.googleapis.com` engelleme testi geçti. Kaydedilen bağlantılar yalnız loopback’tir. Son genişletilmiş çalışma Java 21 PATH’iyle yürütüldü.

Geçen senaryolar: anonim/doğrulanmamış kullanıcıların yayımlanmış metadata ve chunk erişiminin reddi; sahiplik; aktif/eksik `admins.active` alanıyla erişim ve onay; false/string/number/null/list/map ile yetki reddi; kota, onay/ret, eski kayıtlar, kategori/etiket tür ve sınır reddi; dosya/kapak/chunk limitlerinin negatif kontrolleri. Gerçek Auth emülatörüyle kayıt, yeniden gönderme, action code, token yenileme, üyelik, reset ve çıkış da çalıştı.

HTML sandbox izolasyonu ve HTML’in kendi kontrolleri Chromium testlerinde geçti. Ek ileri/geri slayt butonu eklenmedi. HTML/ZIP/klasör/PPTX hazırlama, otomatik kapak, kategori/etiket, arama/sayfalama, taslak koruması, yönetim ve doğru listeye dönüş testleri geçti. Bu tarayıcı akışları kontrollü servislerle çalışır; canlı veri işlemi kabulü değildir.

## Düzeltmeler ve açık hata

- İlk kullanıcı profilinin `pendingDeckId` alanı yokken kurallar tarafından reddedilmesi düzeltildi. Gerçek Auth/Firestore testi artık profilin oluştuğunu ve sıfır pending kotasını da doğruluyor.
- HTML’in beyan edilen açılmış boyutu 25 MB, dosya sayısı 300 ile backend’de de sınırlandı. Gerçek arşivin açılması ve sayılması istemci pipeline’ında yapılır; Firestore ikili HTML arşivini açıp saymaz.
- Kapak testinde React effect’inin gerçekten object URL üretmesini bekleyen kontrol eklendi. CSP test sunucusunun kalan HTTP bağlantıları teardown’da kapatıldı. İlgili 12 test tekrar geçti.
- Backend için demo proje, endpoint guard, runtime socket kaydı ve sıfır-skip kabulü eklendi. 60 saniye tekrar gönderme kilidi E2E’de doğrulandı.

**Açık hata:** Korunan v1 kurallarıyla sekiz etiketli 2/6/10/12 parça; etiketsiz 12 parça; azami HTML/PPTX; ve azami etiketli metadata create/update senaryoları başarısız. Bunlar sekiz ayrı testtir. Emülatör 1000 ifade sınırına ulaşıldığını gösteriyor. Bu oturumdaki başarısız mikro değişiklikler oturum başındaki çalışma kopyasına döndürüldü; önceki profil ve HTML limit düzeltmeleri korundu.

**Yapısal ölçüm ve öneri:** [Manifest alt koleksiyon planı](MANIFEST-ALT-KOLEKSIYON-PLANI.md) per-function coverage, deney, sınırlar ve uygulanacak dosyaları içerir. Başarısız 12 parçanın coverage HTML’i açılıp kaydedildi. Manifest helper 288, etiket helper’ları 144+150 değerlendirme kaydetti; bunlar tüm başarısız transaction’ın kısmi AST sayaçlarıdır, tek belge için kesin maliyet değildir. [Fonksiyon özetindeki](kanit/son-kontrol-2026-10-06/coverage-12-chunks-summary.json) boş/çalıştırılmamış dallar maliyetten çıkarılmıştır.

İzole v2 prototipte ana manifest dizisi kaldırıldı; parça `index/size/data` doğrulaması ve deterministik toplam boyut bağı korundu. 1/6/12 parça + sekiz etiket; azami HTML/PPTX + kapak; oluşturma ve onay geçti. Yanlış boyut/index/veri, ekstra alan, eksik kota ve yabancı sahip reddedildi; transaction geri alındı. **Sekiz etiket + on bağlantı kombinasyonu hâlâ ana belge limitine takılıyor.** Prototip toplamı 22 geçti/1 başarısız/0 skip; komut exit 1 verir. Ana kurallar veya uygulama veri modeli v2’ye geçirilmedi.

Bütçe kontrolünde 12 maliyetli belge yazımı tek transaction’da geçti, yalnız bu başarılı kontrolün coverage gövdesi **8448** değerlendirme kaydetti. Tek aşırı maliyetli belge gerçek 1000 ifade hatasıyla reddedildi. Emülatör v1.22.0 sonucu ifade bütçesinin işlem/belge başına ayrı uygulandığını gösteriyor; transaction toplamına tek 1000 bütçesi uygulanmıyor. [Bütçe özeti](kanit/son-kontrol-2026-10-06/budget-scope-summary.json). Üretim üzerinde deney/deploy yapılmadı. Belge erişimi ve istek boyutu limitleri ayrıca geçerlidir; [Firebase limitleri](https://firebase.google.com/docs/firestore/security/rules-structure#security_rule_limits).

Diğer başarısız denemeler: sandbox içindeki yeni birim tekrarında yerel HTTP portu açma EPERM verdi; Chromium ve yerel port izniyle tekrar 192 geçti/105 skip. ilk birim çalışmasında 190 geçti/1 test ve 1 teardown başarısızdı; düzeltme sonrası 192 geçti. Bir `npm ci` işlemini çalışan testle eşzamanlı başlatmak backend’de geçici `MODULE_NOT_FOUND` yarattı; kurulum bittikten sonra tekrar çalıştırıldı. Bunlar başarılı sayılmadı.

Son etiket doğrulayıcı yeniden yazım komutu otomatik onay incelemesinde reddedildi: referans commit’ten kuralları yeniden kurmanın birikmiş erişim denetimi düzeltmelerini kaybedebileceği ve güvenlik sınırını zayıflatabileceği belirtildi. **Komut uygulanmadı.** Devamda dar, ayrı incelenebilir ve pozitif/negatif kontrollerle kanıtlanan düzeltme hazırlanmalı; reddedilen işlem dolaylı yoldan tekrarlanmamalı.

Audit açık işi `firebase-tools → chokidar → braces` zinciridir; üretim bundle’ına dahil değildir. Registry’de `braces` son sürümü 3.0.3, Firebase CLI son sürümü 15.32.1 olarak görüldü. Audit’in önerdiği CLI 6.8.0’a zorla düşürme uygulanmadı. Güvenli yama/uyumlu çözüm veya yayın öncesi açık bulgu değerlendirmesi gerekiyor.

## Gerçek Firebase kabulü — kullanıcı teyitleri

Önizleme bu Mac’te **http://localhost:4175**, aynı Wi-Fi’da **http://192.168.1.150:4175**. Her iki adres HTTP 200 ile doğrulandı; sunucu devam oturumunda da 4175 portunda açık. [Önizleme kaydı](kanit/son-kontrol-2026-10-06/preview.json) varsayılan gerçek `shared-presentations` projesini, ortam dosyası olmadığını ve açık emülatör seçimini kaydeder. Localhost/DEV otomatik emülatör seçmez; yalnız `VITE_USE_EMULATORS=true` seçer.

| Senaryo | Kullanıcı sonucu |
|---|---|
| Yeni hesap, gelen ileti, doğrulama ve üyelik | “ileti geldi. doğruladım ve çalıştı. giriş yapabildim.” |
| Şifre sıfırlama ve yeni şifre | “şifre sıfırladım sonra yeni şifre ile denedim ve işe yaradı” |
| Google hesap seçimi, iptal ve masaüstü giriş | “evet tüm akış çalışıyor” |
| Gerçek 60 saniye bekleme/yeniden gönderme | “Bekleme ve yeniden gönderme çalıştı” |
| Fiziksel telefonla giriş | “telefondan da giriş yapabiliyorum” |
| Fiziksel telefonda Google | İlk hata unauthorized-domain; Console’da `192.168.1.150` eklenince “ekleyince işe yaradı giriş yapıyor” |

Inbox teslimi kullanıcı gözlemidir; SDK gönderim kabulünden türetilmedi. Kullanıcı hesap bilgilerini kendisi girdi; parola/token istenmedi. Mobil klavye, ayrıntılı görünüm ve diğer tarayıcı kabulü yalnız giriş teyidiyle kapanmış sayılmadı.

## Devam ve yayına kalan koşullar

1. Ölçülmüş [manifest geçiş planını](MANIFEST-ALT-KOLEKSIYON-PLANI.md) uygulama servisinde tamamla; sekiz etiket + on bağlantı maliyetini de çöz. Açık 8 v1 backend sınır hatasını güvenlik sınırlarını koruyarak düzelt; eski kayıt ve yönetici politikası dahil tam backend paketini sıfır skip ile geçir.
2. Java için `JAVA_HOME` yanında `PATH` de Java 21 `bin` dizinini seçmeli. Gerekli ortam: `PATH=/private/tmp/vektor-node24/bin:/private/tmp/vektor-java21/Contents/Home/bin:$PATH`, `JAVA_HOME=/private/tmp/vektor-java21/Contents/Home`, `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/vektor-playwright`, `FIREBASE_EMULATORS_PATH=/private/tmp/vektor-firebase-emulators`. Geçici dizinler temizlenirse araçları yeniden kur.
3. Düzeltme sonrası ilgili ve gerekli tam testleri yeniden çalıştır; rapor/kanıtları güncelle. E2E 4173 portunu kendisi açar; önizleme 4175’te tutuldu, çakışma yoktu.
4. CLI audit bulgusunu ele al; fiziksel mobil klavye/görünüm, diğer tarayıcılar ve ayrı üye/yöneticiyle gerçek sunum işlemlerini kabul et. Güncel canlı kurallar kategori/etiket yazımlarını reddedebilir; kullanıcı bunları önce emülatörde doğrulamalı.
5. Hazır somut commit, `firestore.rules` hash’i, bundle hash’leri, hedef hostname ve geri dönüş planını kullanıcı incelemesine sun. Sonra ayrı yayın yetkisiyle **kurallar → Hosting** sırası; bu çalışmada yayın yetkisi yok.
6. Yayın sonrası gerçek origin’de CSP/cache, derin link, OAuth, fullscreen/indirme ve yönetim kabulü açık kalır. Yerel Vite/Chromium sonuçları bunları kapatmaz.

Kullanıcıdan şimdi ek parola/token veya Console sağlayıcı ayarı gerekmiyor. Devamın ilk işi teknik backend düzeltmesidir; bu çalışma sürümü deploy edilmemeli.
