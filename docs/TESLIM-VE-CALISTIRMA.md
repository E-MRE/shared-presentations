# Vektör — Teslim ve çalıştırma

6 Ekim 2026. Son UI kodu `d5bc1b3` ile GitHub `main` dalında; kullanıcı tarayıcıda çalıştığını teyit etti. Güncel Firestore kuralları kullanıcı talimatıyla canlıya yayımlandı ve birebir doğrulandı; Hosting yayını bekliyor. [Son UI, test, yayın ve secret taraması kaydı](UI-SON-DUZELTMELER-2026-10-06.md), [önceki tam kabul raporu](EMULATOR-TAMAMLAMA-RAPORU.md). Bu oturumda kullanıcı hesabı veya admin belgesi değiştirilmedi.

## Değişen davranış

Giriş/kayıt/sıfırlama/doğrulama aynı akışta yenilendi. Hesap oluşması ile e-posta gönderim isteği ayrı sonuçlar; gönderim hatası görünür, yeniden gönderme aynı hesapla yapılır. Kabul edilen gönderimden sonra 60 saniye bekleme var. SDK kabulü gelen kutusuna teslim olarak sunulmaz. Firebase Console'da oluşturulan e-posta hesabı otomatik doğrulanmış sayılmaz.

Yönetici `active` politikası istemci ve kurallarda aynı: alan yok veya `true` aktif; `false`/hatalı tür yetki vermez. Ek bulgu: eski kurallar yayınlanmış sunum bilgisi ve parçalarını anonim kullanıcılara açıyordu. Yeni kurallar bunları da yalnız doğrulanmış üyelere açar. Sahiplik, onay/kota ve sandbox sınırları korunur.

Dosya seçimi öne alındı; kategori ve etiketler eklendi. Kaydedilmemiş başlık/açıklama/kaynak/dosya/kapak değişikliklerinde rota, geri, vazgeç ve sayfa yenileme uyarıları var. Başarılı kayıttan sonra uyarı yönlendirmeyi engellemez.

Arşiv sayfalı yüklenir. Arama başlık/açıklama/yazar/etiketleri kapsar; kategori filtresi var. Yalnız yüklenen sonuçların kapsamı belirtilir; gerektiğinde “Tüm arşivde ara” kalan sayfalara erişir. Kapatınca geldiğiniz arşiv/kişisel liste/yönetim sekmesi, filtreler ve kaydırma konumu korunur.

İndigo/lacivert tasarım, yerel Türkçe fontlar, mobil hesap/tema menüsü, kapak/başlıktan açma, skeleton'lar ve özgün SVG/Lottie eklendi. Arşiv sayısı yazısı ve kart altındaki ek açma düğmesi kaldırıldı; başlık kategori üstüne alındı, kart içeriği kısaltıldı. Editör boşlukları ve hazır kapak/admin düğmeleri belirginleştirildi. Hareket azaltma ayarı desteklenir. HTML kendi slayt kontrollerini kullanır; ek ileri/geri butonu yok. Sunuma odaklan, kapat, bilgi ve tam ekran korunur.

## Yerel önizlemeyi çalıştırma

Bu Mac üzerinde üretim önizlemesi kullanıcı isteğiyle durduruldu; 4175 ve 4173 portlarında sunucu kalmadı. Yeniden açıldığında `http://localhost:4175` kullanılır. Aynı Wi-Fi'deki telefon için Mac'in güncel IP'si/4175 portu gerekir; önceki `192.168.1.150` IP'sinin değişmediğini varsaymayın. Yerel önizleme HTTPS/origin kabulünü karşılamaz. E2E için 4173 ayrı tutulur.

GitHub deposunda veya kaynak pakette Node 24 LTS (veya Node 22.12+) kullanın. Kilitli Vitest 5 Node 20/23 desteklemiyor; `.nvmrc` Node 24 seçer. Zip gerekmez; depoyu klonlayın veya mevcut kopyada `main` dalını güncelleyin:

```sh
git clone https://github.com/E-MRE/shared-presentations.git
cd shared-presentations
```

Ardından:

```sh
npm ci
npm run build
npm run preview -- --host 0.0.0.0 --port 4175 --strictPort
```

Kendi cihazınızda `http://localhost:4175` açın. Varsayılan bağlantı gerçek `shared-presentations` projesidir; üye olmadan sunumlar gösterilmez. Üretim derlemesinde test hesabı/fixture anahtarı yok. `dist/index.html` dosyasını çift tıklamayla açmak yerine HTTP sunucusu kullanın; uygulama SPA rewrite ister. Durdurmak için sunucuyu çalıştırdığınız terminalde Ctrl+C kullanın.

Gerçek Firebase üzerindeki güncel `firestore.rules` dosyası 6 Ekim 14:24'te yayımlandı. V2 yükleme/düzenleme ve yönetim kabulünü güncel istemciyle yapın; canlı hesabın kota sayacı bu oturumda ayrıca incelenmedi. Yerel build'in kendisi Firebase kurallarını değiştirmez.

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

Firestore kuralları sıfır-skip backend/prototip kabulü sonrasında kullanıcı talimatıyla yayımlandı. Hosting için hedef hostname, güncel v2 uyumlu sürüm ve yayın kararı gerekir. Aşağıdaki sıra gelecekteki yayınlar için korunur; mevcut kural adımı tamamlandı:

```sh
npx firebase deploy --project shared-presentations --only firestore:rules
# İndeks dosyası değişmedi; gerekiyorsa ayrıca kontrol edip uygulayın.
npx firebase deploy --project shared-presentations --only hosting
```

Kurallar yeni kategori/etiket alanlarını opsiyonel kabul eder; eski kayıtlar `Kategorisiz` ve boş etiketlerle okunur. Toplu veri dönüşümü gerekmez. V1 kayıtların okunması ve onayı korunur; yeni oluşturma yalnız v2 kabul edilir. Eski Hosting derlemesine tek başına dönüş v2 kayıtlarla uyumlu değildir. V2 okuyabilen geri dönüş bundle’ı ve uyumlu kurallar birlikte hazırlanmalıdır. Kurallar → Hosting aralığında eski sekmelerin v1 yazımları reddedileceği için yazım geçişi/istemci yenilemesi planlanmalıdır. Eski kurallara körlemesine dönmek anonim yayın okuma açığını ve yönetici iptal sorununu geri getirir. Kural geri dönüşü gerekiyorsa bu iki sınırı koruyan uyumlu sürüm hazırlanmalıdır.

Yayın sonrası gerçek origin'de derin link, giriş, CSP, cache, HTML kendi kontrolleri, fullscreen, PPTX indirme, üyelik ve iki hesaplı yönetim kontrol edilir. Paket veya yerel PASS sonucu canlı deployment onayı sayılmaz.

Son UI doğrulaması, kullanıcı teyidi, secret taraması ve gerçekleşen kural yayını [son düzenleme raporunda](UI-SON-DUZELTMELER-2026-10-06.md). Önceki tam test sonuçları [emülatör raporunda](EMULATOR-TAMAMLAMA-RAPORU.md); ilk kontrol turları [tarihsel son kontrol raporunda](SON-KONTROL-RAPORU.md).

## 6 Ekim v2 geçişi ve yapısal kural ölçümü

[Geçiş ve ölçüm kaydı](MANIFEST-ALT-KOLEKSIYON-PLANI.md): etiket/bağlantı regex maliyeti ölçüldü; ana belge yine limite takılınca links de alt koleksiyona taşındı. Ana belge count/size metadata, çocuklar parça/bağlantı taşır. İlk mimari backend kabulü 160/160 idi; sonraki düzeltmelerle 174 backend + 27 prototip sıfır skip geçti. Gerçek servis v1 okuma/onay/edit ve içerik değişiminde v2’ye geçişi doğrular. Bu testlerdeki kural dosyası artık canlıda; Hosting yayını ayrı adım olarak bekliyor.
