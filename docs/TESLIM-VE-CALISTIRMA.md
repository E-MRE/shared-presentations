# Vektör — Teslim ve çalıştırma

5 Ekim 2026. Yerel düzeltmeler tamamlandı. Canlı Firebase'e deploy, veri silme veya kullanıcı hesabı değiştirme yapılmadı. Kaynak kod, üretim derlemesi, kurallar, testler ve ekran kanıtları birlikte teslim edilir.

## Değişen davranış

Giriş/kayıt/sıfırlama/doğrulama aynı akışta yenilendi. Hesap oluşması ile e-posta gönderim isteği ayrı sonuçlar; gönderim hatası görünür, yeniden gönderme aynı hesapla yapılır. Kabul edilen gönderimden sonra 60 saniye bekleme var. SDK kabulü gelen kutusuna teslim olarak sunulmaz. Firebase Console'da oluşturulan e-posta hesabı otomatik doğrulanmış sayılmaz.

Yönetici `active` politikası istemci ve kurallarda aynı: alan yok veya `true` aktif; `false`/hatalı tür yetki vermez. Ek bulgu: eski kurallar yayınlanmış sunum bilgisi ve parçalarını anonim kullanıcılara açıyordu. Yeni kurallar bunları da yalnız doğrulanmış üyelere açar. Sahiplik, onay/kota ve sandbox sınırları korunur.

Dosya seçimi öne alındı; kategori ve etiketler eklendi. Kaydedilmemiş başlık/açıklama/kaynak/dosya/kapak değişikliklerinde rota, geri, vazgeç ve sayfa yenileme uyarıları var. Başarılı kayıttan sonra uyarı yönlendirmeyi engellemez.

Arşiv sayfalı yüklenir. Arama başlık/açıklama/yazar/etiketleri kapsar; kategori filtresi var. Yalnız yüklenen sonuçların kapsamı belirtilir; gerektiğinde “Tüm arşivde ara” kalan sayfalara erişir. Kapatınca geldiğiniz arşiv/kişisel liste/yönetim sekmesi, filtreler ve kaydırma konumu korunur.

İndigo/lacivert tasarım, yerel Türkçe fontlar, mobil hesap/tema menüsü, kapak/başlık/aç aksiyonları, skeleton'lar ve özgün SVG/Lottie eklendi. Hareket azaltma ayarı desteklenir. HTML kendi slayt kontrollerini kullanır; ek ileri/geri butonu yok. Sunuma odaklan, kapat, bilgi ve tam ekran korunur.

## Çalışan önizleme

Bu çalışma alanında üretim derlemesi `http://127.0.0.1:4175` adresinde çalıştırıldı; derin bağlantılar ve ziyaretçi giriş ekranı Chromium ile kontrol edildi. Bu adres bu çalışma alanına aittir; kullanıcının cihazından buraya erişim sağlamaz. Ortamda dış erişime açılmış port/tünel aracı yok. Dış URL doğrulanmadığı için paylaşılmıyor. `yeni-ekranlar.html` tek başına açılabilen görsel galeridir; gerçek giriş uygulamasının yerine geçmez.

GitHub deposunda veya kaynak pakette Node 20.19+ (bu çalışmada 24) kullanın. Zip gerekmez; depoyu klonlayın veya mevcut kopyada `main` dalını güncelleyin:

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

Bu ortam standart Playwright CDN indirmesine izin vermedi. Chromium npm üzerinden geçici dizine kuruldu ve gerçek tarayıcı testlerinde kullanıldı; paketin normal komutları bu geçici yola bağımlı değildir.

Firestore emülatör JAR'ı `storage.googleapis.com/firebase-preview-drop/...` üzerinden indiriliyor. Bu domain ortamın ağ izin listesinde bulunmadığı için emülatör başlatılamadı. Backend kuralları/gerçek Firestore işlem testleri atlandı; bu testler geçmiş sonuçlara dayanarak başarılı gösterilmez. Yayın öncesinde `npm run test:backend` ağ erişimi olan ortamda çalıştırılmalı ve sonuçlar incelenmelidir. Tarayıcıdaki kontrollü servis testleri gerçek backend yetkisini veya inbox teslimini kanıtlamaz.

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

Son yerel sonuçlar: 191 test ve 35 e2e başarılı; 47 backend kontrolü atlandı. Build, lint ve yerel release checker geçti. Ayrıntılı iş durumu [düzeltme planında](DUZELTME-PLANI.md), kalan kontroller [bağımlılık dosyasında](KULLANICI-BAGIMLILIKLARI.md). Kaynak değişiklikleri GitHub commit diff'inden incelenebilir. Önceki pakette ayrıca ölçümler, ham test kanıtları ve çevrimdışı ekran galerisi bulunur; uygulamayı çalıştırmak için paket gerekmez.
