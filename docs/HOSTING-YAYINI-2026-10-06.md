# Firebase Hosting yayını — 6 Ekim 2026

Bu rapor 16:07'deki ilk yayını kaydeder. Kullanıcı daha sonra yeni adresi seçti; aynı paket 16:35'te **https://vektor-sunum.web.app** adresine kopyalandı. Güncel adres ve deploy hedefi [alan adı geçiş raporunda](DOMAIN-GECISI-2026-10-06.md).

Kullanıcının canlı yayın talimatıyla güncel Vektör uygulaması `shared-presentations` projesinin varsayılan Hosting sitesine yayımlandı.

- Ana adres: **https://shared-presentations.web.app**
- Alternatif adres: **https://shared-presentations.firebaseapp.com**
- Yayın zamanı: **6 Ekim 2026 16:07:57 Türkiye saati** (`2026-10-06T13:07:57.097Z`).
- Kaynak: `785ba89`; UI kodu `d5bc1b3` içinde. Son yayın adımında uygulama kodu değiştirilmedi.
- Hosting sürümü: `23beeb1d595bfc72`; live release: `1791292077097000`.

## Yayın öncesi kontroller

Node 24 ile gerçek Firebase'e bağlanan üretim paketi yeniden derlendi (`VITE_USE_EMULATORS=false`). Lint, TypeScript/Vite build ve yerel release kontrolü geçti; release kontrolünde 0 başarısız sonuç var. Güncel kaynakla tam Chromium E2E paketi **46 geçti, 0 başarısız, 0 skip, 0 retry**. Bu testler kontrollü yerel servisleri kullanır.

Gitleaks 8.30.1 ile `dist` ayrıca tarandı. Tek bulgu, daha önce doğrulanan public Firebase web anahtarı; farklı bir anahtar veya secret bulunmadı. İki Hosting alan adının Firebase Authentication `authorizedDomains` listesinde olduğu salt okunur doğrulandı.

Canlı Firestore kuralları önceden 14:24'te yayımlanan, 174 backend + 27 prototip kabulü geçen dosyayla birebir eşleşiyor. SHA-256:

```text
a9eefa6914251260b18dd1a8167053aeed6f75b659729edff35cdf19b6884869
```

Yalnız Hosting yayımlandı; kurallar zaten günceldi, indeks dosyası değişmedi. Kullanılan komut:

```sh
npx firebase deploy --project shared-presentations --only hosting --non-interactive -m "Release 785ba89: final presentation UI, verified rules, 46 E2E passed"
```

## Canlı yayın doğrulaması

İki HTTPS ana adresi ve ana sitedeki `/`, `/benim`, `/yeni`, `/duzenle/html`, `/admin`, `/s/html`, `/unknown` yolları HTTP 200 ile güncel SPA girişini sundu. HTML ve diğer 48 dosyanın tamamı yerel üretim paketinin SHA-256 değerleriyle eşleşti. HTML no-cache, hash'li assetlerde immutable cache, CSP ve nosniff başlıkları gerçek yanıtlarda doğrulandı.

Gerçek Chromium ile 1280 ve 375 px genişliklerde altı uygulama rotası ve sayfa yenileme kontrol edildi: **12 rota/yenileme kontrolü geçti**. Ziyaretçi üyelik kapısı, giriş penceresi, Google giriş düğmesi, şifre alanı, Escape ile kapanış, tema değişimi/yenilemede korunması çalıştı. Yatay taşma ve tarayıcı runtime hatası yok. Hesapla giriş, mail teslimi, canlı sunum yükleme/onay/silme bu otomatik turda yapılmadı; bu sonuçlar o işlemlerin ayrıca kullanıcı kabulü yerine geçmez.

İlk Node HTTP doğrulaması IPv4/IPv6 bağlantı seçiminde zaman aşımına uğradı. cURL ve Chromium siteye erişti; Node kontrolü IPv4 ile tamamlandı. Yayın paketinde değişiklik gerekmedi.

Yerel 4175/4173 önizlemeleri kapalı kaldı. Canlı siteye mevcut hesabınızla giriş yapabilirsiniz; açık eski uygulama sekmelerini güncel sürüme yenileyin.

[Kaynak, test, Hosting sürümü ve dosya hash'leri](kanit/hosting-yayini-2026-10-06/ozet.json). Önceki UI düzenlemeleri ve secret sınıflandırması [son UI raporunda](UI-SON-DUZELTMELER-2026-10-06.md).

## Gelecekteki yayın ve geri dönüş

Yeni sürüm için build/test/secret kontrolleri ardından açık kullanıcı yayın talimatıyla proje sabitlenerek deploy yapılır. Bu yayından önce live kanalda geri dönülebilecek bir Hosting sürümü kaydedilmedi. Bu yayının sürüm kimliği ve 49 dosyalık manifest kalıcı kayıtta tutuluyor. V2 kayıtlarla uyumlu paket ve kurallar birlikte korunmalı; eski v1 Hosting paketi tek başına geri dönüş için uygun değildir.
