# Son UI düzenlemeleri ve yayın kaydı — 6 Ekim 2026

Kod sürümü [`d5bc1b3`](https://github.com/E-MRE/shared-presentations/commit/d5bc1b3) GitHub `main` dalına gönderildi. Kullanıcı son görünümün çalıştığını tarayıcıda teyit etti. Yerel önizleme kullanıcı isteğiyle durduruldu; 4175 ve test sunucusunun 4173 portlarında dinleyen süreç kalmadı.

## UI değişiklikleri

- Dosya alanıyla “Sunum hazır” kutusu arasına 16 px boşluk eklendi. Kapak bilgisiyle seçim sekmeleri arasındaki boşluk artırıldı; hazır kapak düğmelerinin zemini ve kenarlığı belirginleştirildi.
- Onay Masası kartlarında Reddet düğmesi belirgin kenarlık/zemin, Sil düğmesi kırmızı ton kazandı. Mevcut işlem pencereleri korunuyor.
- Arşivdeki sunum sayısı yazısı ve kartın altındaki ek açma düğmesi kaldırıldı. Kapak ve başlık sunumu açmaya devam ediyor. Kısmi arşivde arama/filtre kapsamı ve sayfalama korunuyor.
- Kartta başlık ilk sıraya alındı; kategori ve HTML/PPTX bilgisi altında birleştirildi. Başlık ve açıklama en fazla iki satır, etiketler ve yazar/tarih daha kompakt. Boş açıklama yer tutmuyor; uzun yazar adı görsel olarak kısaltılıyor.

## Doğrulama

Lint, TypeScript/Vite derlemesi ve `git diff --check` geçti. Kart için Chromium'da 375, 768 ve 1280 px genişliklerde açık/koyu tema, normal/uzun içerik, başlık/kapaktan açma ve listeye dönüş kontrol edildi; yatay taşma yok. Editör ve admin düğmeleri 375/1280 px ve iki temada ayrıca incelendi. Admin Reddet/Sil metin kontrastları en az 4.5:1, dokunma yükseklikleri en az 44 px.

Son kart düzenlemesinden sonra ilgili mevcut E2E senaryoları **4 geçti, 0 başarısız, 0 skip, 0 retry**:

1. Giriş/admin pencerelerinde klavye odağı, doğrulama, kapanış ve odağın geri dönmesi.
2. Sunumdan geldiği kişisel listeye veya admin sekmesine dönüş.
3. Sayfalı arşivde kategori/etiket araması ve sunumdan dönüşte filtrelerin korunması.
4. Arşivin erişilebilir arama alanı, tekrar eden metin ve boş sayaç kontrolleri.

Bu tur tam birim/E2E/backend paketinin tekrar çalıştırılması değildir. Önceki `aeb50f5` tesliminin 200 birim/46 E2E sonuçları [önizleme raporunda](ONIZLEME-VE-BILDIRIM-RAPORU.md); yayımlanan kuralların 174 backend/27 prototip kabulü [emülatör raporunda](EMULATOR-TAMAMLAMA-RAPORU.md). Tarayıcı otomasyonu kontrollü yerel servisleri kullanır; canlı hesabın bütün işlemlerinin kabulü sayılmaz.

## Canlı Firestore kuralları

Kullanıcının yayın talimatıyla `shared-presentations` projesine yalnız Firestore kuralları yayımlandı:

```sh
npx firebase deploy --project shared-presentations --only firestore:rules --non-interactive
```

Yayın zamanı **6 Ekim 2026 14:24:21 Türkiye saati** (`2026-10-06T11:24:21.854713Z`). Derleme/yayın başarılı oldu; Rules API'den tekrar okunan canlı içerik yerel `firestore.rules` dosyasıyla birebir eşleşti. SHA-256:

```text
a9eefa6914251260b18dd1a8167053aeed6f75b659729edff35cdf19b6884869
```

Bu hash, önceki sıfır-skip backend/prototip kabulündeki hash ile aynı. Hosting bu oturumda yayımlanmadı; yerel build Hosting'i güncellemez. Eski v1 istemcileri yeni sunum yazamaz; Hosting yayını v2 uyumlu sürümle ayrıca tamamlanmalı. Admin UID seçimi ve `admins/{UID}` / boolean `active: true` belgesi Console üzerinden kullanıcıya aittir; bu oturumda admin belgesi oluşturulmadı veya hesap değiştirilmedi.

## Secret taraması

Resmi Gitleaks **8.30.1** geçici dizine indirildi, release checksum'u doğrulandı. Git geçmişi (`--all`), izlenen çalışma dosyaları ve commit'e alınan diff tarandı; çıktılar tamamen redakte edildi. Yeni UI diff'inde **0 bulgu** var. Çalışma dosyalarında ve geçmişte ikişer bulgu, `src/firebase.ts` ile `docs/BRIEF.md` içindeki aynı public Firebase web anahtarına ait.

Anahtarın Firebase tarafından oluşturulan Browser key olduğu ve API kısıtlarının bulunduğu salt okunur olarak doğrulandı; Generative Language API izinli değil. Firebase web anahtarının kullanım amacı ve public niteliği [resmi belgede](https://firebase.google.com/docs/projects/api-keys) açıklanıyor. Secret değerleri, kullanıcı UID'leri, yönetim kimlikleri ve CLI oturumu bu rapora veya commit'e eklenmedi. Tarama bir sızıntı garantisi değildir; kapsam içinde public yapılandırma dışı bir secret saptanmadı.

[Makine tarafından okunabilir sonuç özeti](kanit/ui-son-duzeltmeler-2026-10-06/ozet.json). Ham tarama ve tarayıcı kayıtları geçici yerel dizinlerde tutuldu; bu teslimde özet kaydı kalıcılaştırıldı.
