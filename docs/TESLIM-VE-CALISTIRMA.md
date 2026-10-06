# Vektör — Teslim ve çalıştırma

6 Ekim 2026. Son kontrol çalışması devam ediyor; güncel sonuçlar [son kontrol raporunda](SON-KONTROL-RAPORU.md). Canlı Firebase'e deploy, veri silme veya kullanıcı hesabı değiştirme yapılmadı. Kaynak kod, üretim derlemesi, kurallar, testler ve ekran kanıtları birlikte teslim edilir.

## Değişen davranış

Giriş/kayıt/sıfırlama/doğrulama aynı akışta yenilendi. Hesap oluşması ile e-posta gönderim isteği ayrı sonuçlar; gönderim hatası görünür, yeniden gönderme aynı hesapla yapılır. Kabul edilen gönderimden sonra 60 saniye bekleme var. SDK kabulü gelen kutusuna teslim olarak sunulmaz. Firebase Console'da oluşturulan e-posta hesabı otomatik doğrulanmış sayılmaz.

Yönetici `active` politikası istemci ve kurallarda aynı: alan yok veya `true` aktif; `false`/hatalı tür yetki vermez. Ek bulgu: eski kurallar yayınlanmış sunum bilgisi ve parçalarını anonim kullanıcılara açıyordu. Yeni kurallar bunları da yalnız doğrulanmış üyelere açar. Sahiplik, onay/kota ve sandbox sınırları korunur.

Dosya seçimi öne alındı; kategori ve etiketler eklendi. Kaydedilmemiş başlık/açıklama/kaynak/dosya/kapak değişikliklerinde rota, geri, vazgeç ve sayfa yenileme uyarıları var. Başarılı kayıttan sonra uyarı yönlendirmeyi engellemez.

Arşiv sayfalı yüklenir. Arama başlık/açıklama/yazar/etiketleri kapsar; kategori filtresi var. Yalnız yüklenen sonuçların kapsamı belirtilir; gerektiğinde “Tüm arşivde ara” kalan sayfalara erişir. Kapatınca geldiğiniz arşiv/kişisel liste/yönetim sekmesi, filtreler ve kaydırma konumu korunur.

İndigo/lacivert tasarım, yerel Türkçe fontlar, mobil hesap/tema menüsü, kapak/başlık/aç aksiyonları, skeleton'lar ve özgün SVG/Lottie eklendi. Hareket azaltma ayarı desteklenir. HTML kendi slayt kontrollerini kullanır; ek ileri/geri butonu yok. Sunuma odaklan, kapat, bilgi ve tam ekran korunur.

## Çalışan önizleme

Bu Mac üzerinde üretim önizlemesi `http://localhost:4175` adresinde açık. Aynı Wi-Fi üzerindeki fiziksel telefon için `http://192.168.1.150:4175`. Her iki adres HTTP 200 ile kontrol edildi; kullanıcı telefondan girişi teyit etti. Bunlar yerel önizleme adresleridir, yayın sonrası HTTPS/origin kabulünü karşılamaz. E2E için 4173 ayrı tutulur.

GitHub deposunda veya kaynak pakette Node 24 LTS (veya Node 22.12+) kullanın. Kilitli Vitest 5 Node 20/23 desteklemiyor; `.nvmrc` Node 24 seçer. Zip gerekmez; depoyu klonlayın veya mevcut kopyada `main` dalını güncelleyin:

```sh
git clone https://github.com/E-MRE/shared-presentations.git
cd shared-presentations
```

Ardından:

```sh
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Kendi cihazınızda `http://localhost:4173` açın. Varsayılan bağlantı gerçek `shared-presentations` projesidir; üye olmadan sunumlar gösterilmez. Üretim derlemesinde test hesabı/fixture anahtarı yok. `dist/index.html` dosyasını çift tıklamayla açmak yerine HTTP sunucusu kullanın; uygulama SPA rewrite ister.

Gerçek Firebase üzerinde yeni kategori/etiket yazımları güncel `firestore.rules` dosyasını gerektirir. Bu kurallar canlıya uygulanmadı; eski kurallarla yeni yükleme/düzenleme isteği reddedilebilir. İlk önizlemede giriş/e-posta/Google denemesi yapılabilir. Tam sunum işlemlerini önce emülatörde, sonra somut kural yayınından sonra gerçek projede kabul edin.

Yalnız derlemeyi çalıştırmak için `dist/` klasörünü bir SPA sunucusundan servis edebilirsiniz. Paket Firebase Hosting ayarlarını içerir; Vite önizlemesi Hosting'in CSP ve cache header kabulünü kanıtlamaz.

## Gerçek e-posta ve Google denemesi — kullanıcı

1. E-posta ile yeni bir test hesabı oluşturun. Adresi kendiniz girin; parola veya doğrulama bağlantısını paylaşmayın.
2. Gönderim sonucunu ekranda kontrol edin. Gelen kutusu/spam klasörünü kontrol edip Firebase'in doğrulama bağlantısını açın. Uygulamaya dönüp “Doğruladım, yeniden kontrol et” seçin.
3. Başarısız gönderimde ekrandaki hata metnini not edin. İstek kabul edildiği hâlde ileti yoksa teslim sorununu ayrı kaydedin; tekrar kayıt olmayın. Gerekirse bekleme süresinden sonra yeniden gönderin.
4. Şifre sıfırlama ve Google hesabı seçimi/iptalini deneyin. Google için `auth/unauthorized-domain` görünürse Firebase Console → Authentication → Settings → Authorized domains → Add domain üzerinden kullandığınız hostname'i ekleyin. Örneğin `localhost` veya kendi preview alan adınız; `http://`, port ve URL yolu girilmez. Sağlayıcılar zaten etkin; tekrar açılması gerekmiyor.
5. Teslim sorunu sürerse Console → Authentication → Templates içindeki doğrulama/sıfırlama gönderici, dil ve action URL ayarlarını inceleyin. Varsayılan Firebase action handler'ı kullanılabilir; bu sürüm özel SMTP servisi gerektirmez.

Canlı yönetim kabulü gerekiyorsa kendi Google/verified-email hesabınızın Auth UID'siyle `admins/{uid}` belgesini Console'da oluşturun (`active: true`). Normal test hesabına yönetici belgesi vermeyin. Yönetici hesabıyla ayrı test sunumu ekleme/onay/ret/yeniden onay akışını deneyin; UID'yi veya hesabı paylaşmayın.

## Test komutları ve açık ortam kontrolü

E2E sunucusu 4173 portunu kendisi açar; testten önce aynı portta çalışan dev/preview sunucusunu kapatın.

```sh
npx playwright install chromium
npm run lint
npm run build
EVIDENCE_DIR=test-results/unit npm run test:unit -- --maxWorkers=1
EVIDENCE_DIR=test-results/e2e npm run test:e2e -- --workers=1
npm run check:release
# Java 21 ve emülatör indirme erişimi olan ortamda:
npm run test:backend
```

6 Ekim kontrolünde resmi Playwright Chromium ve Firestore JAR indirmeleri tamamlandı; Java 21 hazırlandı. `npm run test:backend` artık yalnız `demo-shared-presentations` ve yerel Auth/Firestore adresleriyle çalışır. SDK socket hedefleri kaydedilir, yerel dışı bağlantılar engellenir; emülatör yokluğu veya skip sonucu başarısızlık üretir. Birim paketinde atlanan backend testleri bu ayrı komutla gerçekten çalıştırılır.

Emülatörle geliştirme için `.env.example` → `.env.local`, `VITE_USE_EMULATORS=true`, ardından `npx firebase emulators:start --project shared-presentations --only auth,firestore` ve `npm run dev`. Gerçek projeye dönmek için değişkeni `false` yapıp Vite'ı yeniden başlatın. Localhost ve `DEV` tek başına emülatörü seçmez. Tünelde emülatör adresleri tarayıcıdan erişilebilir olmalıdır; `localhost` kullanıcının kendi cihazını gösterir. Emülatör gerçek e-posta göndermez.

## Yayına geçiş ve geri dönüş

Bu çalışma yayını kapsamıyor. Yayına geçmeden backend testleri, gerçek U04 e-posta/Google kabulü ve hedef hostname tamamlanmalıdır. Somut sürümün incelenmesinden sonra kurallar önce, Hosting sonra uygulanır:

```sh
npx firebase deploy --project shared-presentations --only firestore:rules
# İndeks dosyası değişmedi; gerekiyorsa ayrıca kontrol edip uygulayın.
npx firebase deploy --project shared-presentations --only hosting
```

Kurallar yeni kategori/etiket alanlarını opsiyonel kabul eder; eski kayıtlar `Kategorisiz` ve boş etiketlerle okunur. Toplu veri dönüşümü gerekmez. Eski Hosting derlemesine dönüş mümkündür; yeni kurallar eski kategorisiz istemci payload'larını kabul eder. Eski kurallara körlemesine dönmek anonim yayın okuma açığını ve yönetici iptal sorununu geri getirir. Kural geri dönüşü gerekiyorsa bu iki sınırı koruyan uyumlu sürüm hazırlanmalıdır.

Yayın sonrası gerçek origin'de derin link, giriş, CSP, cache, HTML kendi kontrolleri, fullscreen, PPTX indirme, üyelik ve iki hesaplı yönetim kontrol edilir. Paket veya yerel PASS sonucu canlı deployment onayı sayılmaz.

Güncel komut sonuçları, başarısız ilk denemeler, düzeltmeler, kullanıcı teyitleri ve yayına kalan koşullar [son kontrol raporunda](SON-KONTROL-RAPORU.md) ve kalıcı kanıt dizininde bulunur.

## 6 Ekim yapısal kural ölçümü

[Manifest alt koleksiyon geçiş planı](MANIFEST-ALT-KOLEKSIYON-PLANI.md) ve `npm run test:manifest-prototype` izole deneydir. 1/6/12 parça + sekiz etiket geçti; tam prototip 22 geçti/1 başarısız/0 skip (sekiz etiket + on bağlantı). Uygulama hâlâ v1 kullanıyor, güncel backend 131 geçti/8 başarısız/0 skip. Yayına hazır değildir. Üretim yapılandırması test kurallarını kullanmaz.
