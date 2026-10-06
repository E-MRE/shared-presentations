# Vektör — Yeni Hosting adresi

Kullanıcı `vektor.web.app` adını istedi. Firebase'in değişiklik yapmayan `validateOnly` kontrolü bu adın başka projeye ayrıldığını bildirdi. Kullanıcı müsait bulunan **`vektor-sunum.web.app`** alternatifini seçti.

## Güncel adres ve yayın

- Ana adres: **https://vektor-sunum.web.app**
- Alternatif adres: **https://vektor-sunum.firebaseapp.com**
- Firebase projesi: `shared-presentations`; yeni Hosting sitesi: `vektor-sunum`.
- Yeni adrese yayın: **6 Ekim 2026 16:35:10 Türkiye saati** (`2026-10-06T13:35:10.006Z`).
- Yeni Hosting sürümü: `29a11734c239f3b4`; live release: `1791293710006000`.
- Kopyalanan kaynak sürüm: `shared-presentations@23beeb1d595bfc72`. Uygulama kaynağı `785ba89`, son UI kodu `d5bc1b3`.

Yeni Hosting sitesi mevcut Firebase projesinde oluşturuldu. Aynı Auth kullanıcıları, Firestore sunumları ve yönetici belgeleri kullanılır; veri veya hesap taşıma yapılmadı. Yeni adres ayrı bir tarayıcı origin'i olduğundan mevcut hesabınızla burada giriş yapın; yeniden hesap oluşturmanız gerekmez.

İlk site oluşturma denemesinde mevcut Web App'i ikinci Hosting sitesine `--app` ile bağlamak Firebase tarafından reddedildi. İkinci site bu opsiyonel bağlantı olmadan oluşturuldu; kopyalanan uygulamanın Firebase yapılandırması aynı projeye bağlanmayı sürdürür.

## Yapılan işlemler

```sh
npx firebase hosting:sites:create vektor-sunum --project shared-presentations --non-interactive
npx firebase target:apply hosting vektor vektor-sunum --project shared-presentations --non-interactive
npx firebase hosting:clone shared-presentations@23beeb1d595bfc72 vektor-sunum:live --project shared-presentations --non-interactive
```

Firebase Authentication `authorizedDomains` listesine `vektor-sunum.web.app` ve `vektor-sunum.firebaseapp.com` eklendi; önceki alan adları korundu ve ayar tekrar okunarak doğrulandı. Kullanıcı/admin belgeleri veya Firestore kuralları değiştirilmedi.

Yerel `firebase.json` artık `target: "vektor"` kullanır; `.firebaserc` bu hedefi `shared-presentations` projesinin `vektor-sunum` sitesine bağlar. Sonraki onaylı üretim yayını, normal build/test/secret kontrollerinden sonra:

```sh
npx firebase deploy --project shared-presentations --only hosting:vektor --non-interactive
```

Önceki `shared-presentations.web.app` / `shared-presentations.firebaseapp.com` adresleri ilk sürümü sunmaya devam ediyor; otomatik yönlendirme eklenmedi. Yeni deploy hedefi eski siteyi güncellemez. Paylaşılacak güncel adres `vektor-sunum.web.app`.

## Doğrulama

- Yeni iki HTTPS adresi ve eski iki adres HTTP 200 döndü. Yeni sitede altı doğrudan rota/fallback kontrolü de geçti; toplam 10 HTML isteğinin hash'i üretim manifestiyle eşleşti.
- HTML ve diğer 48 dosyanın tamamı **49/49** hash eşleşmesi verdi. HTML no-cache, hash'li assetlerde immutable cache, CSP ve nosniff doğrulandı. Eski sitenin release kimliği değişmedi.
- Gerçek Chromium'da 1280 ve 375 px ile altı rota/yenileme: **12 kontrol geçti**. Giriş penceresi, Google düğmesi, şifre alanı, Escape ve tema kalıcılığı çalıştı. Yatay taşma veya runtime hatası görülmedi.
- Hosting target/proje eşleşmesi ve yerel release kontrolü geçti. Önceki tam **46 E2E** kabulüyle aynı uygulama paketi kopyalandı; alan adı geçişinde tam test paketleri veya build yeniden çalıştırılmadı.
- Gerçek hesapla Google/e-posta girişi veya canlı yükleme/onay/silme yapılmadı. Yetkili alan adı ayarının doğrulanması, bu hesaplı işlemlerin ayrı kabulü değildir.

[Kalıcı doğrulama özeti](kanit/domain-gecisi-2026-10-06/ozet.json). İlk yayının dosya manifesti ve test kanıtları [Hosting raporunda](HOSTING-YAYINI-2026-10-06.md); tüm geliştirme süreci [süreç özetinde](SUREC-OZETI-2026-10-06.md).

Yöntem: [Firebase çoklu Hosting siteleri](https://firebase.google.com/docs/hosting/multisites) ve [doğrulanmış sürümü başka siteye kopyalama](https://firebase.google.com/docs/hosting/manage-hosting-resources).
