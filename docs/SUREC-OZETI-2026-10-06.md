# Vektör — Geliştirmeden canlı yayına süreç özeti

**Kapsam:** 2–6 Ekim 2026. Bu belge Git geçmişini, proje raporlarını ve kalıcı doğrulama kayıtlarını birleştirir. Eski raporlardaki “yayın bekliyor” veya “emülatör engelli” ifadeleri yazıldıkları anı anlatır; güncel sonuç aşağıdadır. Saatler aksi belirtilmedikçe Türkiye saatidir.

## 1. Son durum

Vektör, Firebase `shared-presentations` projesinde canlıya yayımlandı:

- **Uygulama:** https://shared-presentations.web.app
- **Alternatif adres:** https://shared-presentations.firebaseapp.com
- **Depo:** https://github.com/E-MRE/shared-presentations — `main`
- **Firestore kural yayını:** 6 Ekim 2026, 14:24:21.
- **Hosting yayını:** 6 Ekim 2026, 16:07:57.
- **Yayımlanan kaynak:** `785ba89`; son uygulama/UI değişiklikleri `d5bc1b3` içinde.
- **Hosting sürümü:** `23beeb1d595bfc72`; live release `1791292077097000`.
- **Yayın kaydının commit'i:** `4fe1146`. Yayın sonrası belge değişiklikleri uygulama paketini değiştirmedi.

Kullanıcı son UI'ın çalıştığını tarayıcıda teyit etti ve ardından Firebase yayınını istedi. Kararlaştırılan geliştirme ve yayın kapsamı tamamlandı. Yerel önizleme kullanıcı isteğiyle durduruldu; 4175/4173 portları son kontrolde kapalıydı.

## 2. Planlama ve ilk uygulama

Başlangıç deposunda uygulama iskeleti bulunmuyordu. Onaylı tasarım girdileri ve ürün ihtiyaçları üzerinden Türkçe ekip sunum kütüphanesi planlandı. Vite, React, TypeScript, React Router ve modular Firebase Auth/Firestore temel alındı. Firebase Storage veya ek ücretli sunucu yerine içerik tarayıcıda hazırlanıp Firestore parça belgelerinde saklandı.

Geliştirme; temel kurulum, güvenlik/veri sözleşmeleri, auth/veri servisi, içerik hazırlama, ortak UI, görüntüleyici, arşiv/yönetim, yükleme/düzenleme ve uygulama entegrasyonu olarak yürütüldü. Git geçmişinde modüllerin ayrı geliştirme ve birleştirme kayıtları bulunur. İlk plan [PLAN.md](PLAN.md), başlangıç sözleşmeleri [ARCHITECTURE.md](ARCHITECTURE.md) içindedir; sonraki v2 değişiklikleri ayrıca kaydedildi.

Altı ana rota tamamlandı: arşiv `/`, kişisel liste `/benim`, yükleme `/yeni`, sahip düzenlemesi `/duzenle/:id`, Onay Masası `/admin` ve sunum görüntüleme `/s/:id`.

## 3. Tamamlanan ürün akışları

**Üyelik:** Gerçek Google/e-posta girişi, kayıt, doğrulama, yeniden gönderme, şifre sıfırlama, token yenileme ve çıkış kuruldu. Üyelik Google girişi veya doğrulanmış e-posta gerektirir. Yetki oluşmadan sunum abonelikleri açılmaz; hesap/rol değişimlerinde abonelikler ve eski işlemlerin geç sonuçları yönetilir.

**Yönetici:** Yetki e-posta listesiyle değil `admins/{Auth UID}` belgesiyle belirlenir. Kullanıcıya Console'da seçtiği hesabın UID'siyle belge oluşturup `active` alanını boolean `true` yapması tarif edildi. Ajan kullanıcı hesabı/admin belgesi oluşturmadı veya değiştirmedi; kullanıcı Onay Masası ekranını paylaştı. Yetki iptali ve hatalı alan türlerinin reddi backend testlerinde sınandı.

**İçerik:** Tek HTML, HTML klasörü/ZIP ve PPTX akışları eklendi. Paket yapısı/dosya yolları doğrulanır; HTML kaynakları uygun olduğunda birleştirilir, içerik parçalanır, otomatik/özel/varsayılan kapak sunulur. HTML kendi kontrolleriyle sandbox içinde çalışır. PPTX slaytlara dönüştürülmez; bilgi ve indirme sağlanır.

**Arşiv ve yönetim:** Sayfalı arşiv, kişisel sunumlar, kategori/etiket araması, sahip düzenlemesi, onay/ret, yayından kaldırma ve silme tamamlandı. Sunumdan çıkınca geldiği liste/sekme, filtre ve kaydırma konumu korunur. İlgili sahip düzenlemeleri yeniden onaya döner. Kullanıcı başına **beş bekleyen sunum** sınırı korundu.

## 4. İnceleme, veri modeli ve güvenlik düzeltmeleri

İlk entegrasyon sonrasında auth, erişim, kota ve içerik sınırları incelendi. Anonim kullanıcıların yayımlanmış sunum bilgisi/parçalarına erişimi kapatıldı; istemci ve Firestore yönetici politikası uyumlu hale getirildi. İlk profil oluşturma, doğrulama ileti sonucu ve gönderim sonrası bekleme sorunları düzeltildi.

Yoğun manifest doğrulamasının Firestore ifade sınırına ulaşması ölçüldü. Doğrulayıcı sadeleştirmesi yeterli olmayınca **v2 belge modeli** uygulandı: ana belge metadata, sayılar ve boyutları; çocuk belgeler içerik parçalarını ve kaynak bağlantılarını taşır. Yeni oluşturma/içerik değiştirme v2 kullanır; eski v1 okuma/onay ve desteklenen düzenlemeler korunur. Kota/içerik yazımları atomik kalır; değiştirme/silmede eski çocuk belgeler temizlenir. [Geçiş ve ölçüm raporu](MANIFEST-ALT-KOLEKSIYON-PLANI.md) bu kararın kanıtlarını içerir.

Sonraki incelemede sayaç azaltma gerçek sahiplik/durum geçişine bağlandı. Liste kartları için gereksiz bağlantı okumaları kaldırıldı; tek bozuk bağlantının bütün arşiv/kişisel liste/onay kuyruğunu bozması engellendi. Ayrıntıdaki içerik doğrulaması korundu; boş bağlantı etiketi kontrolleri uyumlu hale getirildi. [İnceleme kaydı](INCELEME-2026-10-06.md) tarihsel bulguları, [emülatör tamamlama raporu](EMULATOR-TAMAMLAMA-RAPORU.md) düzeltmelerin kabulünü gösterir.

Backend deneyleri yalnız demo proje ve yerel Auth/Firestore emülatörlerinde yapıldı. Eksik emülatör veya atlanan test başarı sayılmadı; soket korumasıyla canlı bağlantılar engellendi. İlk ağ/araç indirme engelleri giderildikten sonra kabul paketleri sıfır atlama ile tamamlandı.

## 5. UI yenilemesi ve kullanıcı geri bildirimi

Onaylı prototip üzerinden açık/koyu tema, yerel Türkçe fontlar, mobil gezinme, klavye odağı, modal davranışları, boş/yükleme durumları ve azaltılmış hareket desteği düzenlendi. Dosya seçimi öne alındı; kaydedilmemiş form uyarıları, kategori/etiketler ve daha açık giriş/doğrulama ekranları eklendi.

Hazırlama ve bildirim geri bildirimleri üzerine:

- Önizleme görünür, mobil uyumlu pencereye taşındı; Escape ile kapanma ve odağın geri dönmesi sağlandı.
- Teknik hazırlama ayrıntıları yerine görünümü etkileyen durumlar kısa notlarla anlatıldı.
- Kapak alanına **Görsel yükle / Hazır kapak** sekmeleri ve sürükleme/seçme eklendi.
- Geçici işlem sonuçları ekranda sabit snackbar bildirimlerine taşındı. Başarı/bilgi 4, hata 8 saniye görünür; kullanıcı kapatabilir, fare/odak üzerindeyken süre durur.
- Gönderim hatasında dosya/form korunur; tekrar eden aynı işlem bildirimi birikmez. Beş bekleyen sınırı değiştirilmedi.

Ekran görüntülerindeki ayrıntılar da düzeltildi: “Sunum hazır” üstüne ve kapak/sekme arasına boşluk eklendi; hazır kapak düğmeleri belirginleştirildi. Onay Masası'nda Reddet kenarlık/zemin, Sil kırmızı ton kazandı.

Arşiv kartları kullanıcının istediği **impeccable** yaklaşımıyla sadeleştirildi. Gereksiz sunum sayısı ve kart altındaki ek “Sunumu aç” düğmesi kaldırıldı. Başlık kategori üstüne alındı; başlık/açıklama iki satırla sınırlandı, etiketler ve yazar/tarih kısaltıldı. Kapak/başlıktan açma, arama ve sayfalama korundu. Kullanıcı “güzel çalışıyor” diyerek son görünümü teyit etti. [Önizleme/bildirim raporu](ONIZLEME-VE-BILDIRIM-RAPORU.md) ve [son UI raporu](UI-SON-DUZELTMELER-2026-10-06.md) ayrıntıları kaydeder.

## 6. Testler ve kabul kapsamı

Farklı turlar aynı ana ait değildir; örtüşen paketler benzersiz toplam oluşturmak için toplanmaz.

| Aşama | Kaydedilen sonuç | Kapsam |
|---|---|---|
| İlk v2 kabulü | 160 backend + 27 prototip geçti; sıfır atlama | Veri modeli, sınırlar, v1 uyumu ve kural ölçümleri |
| Kota/liste düzeltmeleri (`08eabdf`) | 174 backend + 27 prototip geçti; sıfır başarısız/atlama | Sonradan yayımlanan kuralların kabulü |
| Önizleme/bildirim (`aeb50f5`) | 200 birim geçti; 139 emülatör/prototip senaryosu birim komutunda atlandı. Tam E2E 46 geçti; son stil sonrası ilgili 5 senaryo tekrar geçti | Atlanan senaryolar ayrı backend/prototip kabul komutlarında gerçekten çalıştırıldı |
| Son UI (`d5bc1b3`) | Lint/build ve ilgili 4 E2E geçti | Kartlar 375/768/1280 px, açık/koyu tema; editör/admin ayrıca 375/1280 px |
| Hosting öncesi (`785ba89`) | Lint/build/release geçti; tam E2E **46 geçti, 0 başarısız, 0 atlama, 0 retry** | Güncel üretim paketi; birim/backend bu turda yeniden çalıştırılmadı |
| Hosting sonrası | **49 dosya hash'i eşleşti; 8 HTML isteği, 12 tarayıcı rota/yenileme kontrolü geçti** | Canlı HTTPS, gerçek Chromium, 1280/375 px, ziyaretçi akışları |

Kullanıcı önceki sürümde gerçek e-posta teslimi/doğrulama, şifre sıfırlama/yeni şifre, Google hesap seçimi/iptal/giriş, 60 saniye bekleme/yeniden gönderme ve fiziksel telefonda girişin çalıştığını bildirdi. Telefonda authorized-domain hatası yerel hostname Firebase'e eklenince çözüldü. Bu kullanıcı gözlemleri [tarihsel son kontrol raporunda](SON-KONTROL-RAPORU.md) kayıtlıdır.

Yerel tarayıcı testleri gerçek React bileşenleriyle kontrollü servisleri kullanır. Canlı yayın otomasyonu ziyaretçi ekranlarını kontrol etti; hesapla OAuth/mail veya yükleme/onay/silme yapmadı. Genel UI teyidi bütün tarayıcı ve hesap/işlem kombinasyonları için ayrı kabul sayılmadı.

## 7. Secret taraması ve Git teslimi

Kullanıcının talebiyle resmi Gitleaks 8.30.1 kullanıldı; araç checksum'u doğrulandı. Git geçmişi, izlenen dosyalar, commit diff'leri ve üretim `dist` paketi tarandı.

Çalışma dosyalarında ve geçmişte ikişer bulgu, `src/firebase.ts` ile `docs/BRIEF.md` içindeki aynı **public Firebase web anahtarına** aitti. Üretim paketinde aynı anahtar bir bulgu verdi. Browser key niteliği ve API kısıtları salt okunur doğrulandı. UI diff'inde ve yayın belgelerinin staged diff'inde bulgu yoktu; kapsam içinde public yapılandırma dışı secret saptanmadı. Anahtar değerleri, token/parola, yönetim kimlikleri ve gerçek UID'ler raporlara eklenmedi.

| Commit | Kilometre taşı |
|---|---|
| `df7311b` | Uygulama temeli ve Hosting iskeleti |
| `6f14576` | Güvenlik sözleşmeleri, kurallar ve indeksler |
| `1dd9c66` / `83cfc0f` | Gerçek auth/veri servisi ve içerik pipeline'ı |
| `94e5036` / `6b833c0` / `e2f6f3b` | Görüntüleyici, arşiv/yönetim, yükleme/düzenleme |
| `4e85348` | UI yenilemesi, auth/erişim ve sunum akışı düzeltmeleri |
| `ee4f5c0` | V2 manifest/bağlantı modeli |
| `08eabdf` / `82813d2` | Kota/liste/UX düzeltmeleri ve emülatör kabulü |
| `aeb50f5` | Önizleme penceresi, kapak sekmeleri ve bildirimler |
| `d5bc1b3` | Son kart/editör/admin UI düzenlemeleri |
| `785ba89` | Son UI, secret taraması ve canlı kural yayın belgeleri |
| `4fe1146` | Doğrulanmış Hosting yayın belgeleri |

Son UI ve teslim/yayın belgeleri `main` dalına commit/push edildi. Ağır ham log/tarayıcı/tarama kayıtları yerel veya geçici dizinlerde; kalıcı özetler ve seçilmiş kanıtlar `docs/kanit/` altında tutuldu.

## 8. Firebase yayını ve canlı doğrulama

Önce kabulü geçen Firestore kuralları 14:24:21'de yayımlandı. Rules API'den okunan canlı içerik yerel dosyayla birebir eşleşti. Kural SHA-256 değeri:

```text
a9eefa6914251260b18dd1a8167053aeed6f75b659729edff35cdf19b6884869
```

Kullanıcı geliştirmeyi kapatıp yayını istediğinde Node 24 ile `VITE_USE_EMULATORS=false` üretim paketi derlendi; lint/release, tam E2E ve paket secret kontrolü tamamlandı. Hosting hedefi ve iki Firebase alan adının Authentication `authorizedDomains` listesinde olduğu doğrulandı.

Kurallar zaten eşleştiği ve indeks dosyası değişmediği için son adımda yalnız **Hosting** yayımlandı. Yayın 16:07:57'de tamamlandı. İki HTTPS adresi, doğrudan rotalar ve SPA fallback HTTP 200 döndü. HTML ve diğer 48 dosyanın hash'leri pakete eşleşti; HTML no-cache, hash'li assetlerde immutable cache, CSP ve nosniff başlıkları doğrulandı.

Gerçek Chromium ile masaüstü/mobil genişliklerinde altı rota/yenileme, giriş penceresi/Google düğmesi/şifre alanı/Escape, tema değişimi ve yenilemede korunması kontrol edildi. Yatay taşma/runtime hatası görülmedi. İlk Node bağlantı zaman aşımı IPv4 seçimiyle giderildi; uygulama değişmedi. [Yayın raporu](HOSTING-YAYINI-2026-10-06.md) ve [sürüm/dosya manifesti](kanit/hosting-yayini-2026-10-06/ozet.json) kalıcı kayıttır.

## 9. Bakım ve doğrulama notları

Bu maddeler yeni geliştirme talebi değil, teslimde kayıtlı sınırlar ve sonraki bakım için referanstır:

- Son kaydedilen audit'te production bağımlılıkları 0 bulgu verdi. Firebase CLI → chokidar → braces geliştirme zincirindeki aynı advisory'nin 3 high paket girdisi açık kaldı; zorla eski CLI'ye dönüş yapılmadı. Uyumlu upstream düzeltme bakım kapsamında değerlendirilir; bu belge için yeni audit çalıştırılmadı.
- Kullanıcının önceden sorun yaşadığı özgün HTML'in kök nedeni ayrıca doğrulanmadı. Son UI kabul edildi; dosyaya özel tanı ile genel UI kabulü ayrı kayıtlardır.
- Canlı hesaplı OAuth/mail, iki hesaplı yönetim, fiziksel mobil ayrıntıları ve farklı tarayıcılar son yayın otomasyonunun kapsamına girmedi. Ayrıntılı kontroller uygun test kayıtlarıyla yapılır.
- Beşten az gerçek bekleyen varken kota hatası tekrarlanırsa profil sayacı ve kayıtlar birlikte incelenir. Bu süreçte canlı hesap sayacı okunmadı/değiştirilmedi.
- Eski v1 Hosting paketine tek başına dönüş v2 kayıtlarla uyumlu değildir; v2 okuyabilen paket ve güvenli uyumlu kurallar birlikte korunur. Önceki Hosting sürümü kaydedilmedi; mevcut sürüm/manifest saklandı.
- Node 24 LTS, backend için Java 21 ve Playwright Chromium kullanılır. Geçici araç/ham kayıt dizinleri kalıcı arşiv değildir. Yerel build canlı Hosting/kuralları güncellemez; sonraki yayında proje hedefi açıkça belirtilir.

Çalıştırma komutları [TESLIM-VE-CALISTIRMA.md](TESLIM-VE-CALISTIRMA.md), operasyon/yayın sırası [OPERATIONS.md](OPERATIONS.md), kullanıcıya ait Console/kabul adımları [KULLANICI-BAGIMLILIKLARI.md](KULLANICI-BAGIMLILIKLARI.md) içindedir.
