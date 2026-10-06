# Vektör — Öncelik sıralı düzeltme planı

Tarih: 6 Ekim 2026 · Durum: v2 yerelde tamamlandı; backend 160/160, yayın kabulü açık · Sorumlu: Codex

Bu plan, inceleme raporundaki F01–F16 bulgularının tamamını ve bunları kapatmak için gereken hazırlık, doğrulama ve teslim işlerini kapsar. Kullanıcı bağımlılıkları netleştirildi ve yerel ürün düzeltmeleri uygulandı. Güncel uygulama, test sonuçları ve dış ortamda kalan kontroller [teslim belgesinde](TESLIM-VE-CALISTIRMA.md) kayıtlı. İşaretler yerel uygulama adımlarını gösterir; aşağıdaki emülatör/canlı kabul notları tam yayın kabulü yerine geçmez.

## 6 Ekim son kontrol güncellemesi — devam noktası

[SON-KONTROL-RAPORU](SON-KONTROL-RAPORU.md) güncel durumun kaynağıdır; aşağıdaki 5 Ekim sonuçları tarihsel uygulama kaydıdır.

- [x] Node 24, Java 21, kilit dosyası kurulumu ve resmi Chromium indirimi.
- [x] Önceki 47 backend kontrolü gerçekten çalıştı; demo proje ve SDK socket guard ile canlı bağlantı engellendi.
- [x] Gerçek hesap/e-posta/doğrulama, 60 saniye bekleme/yeniden gönderme, reset ve Google; fiziksel telefonda e-posta ve Google girişi kullanıcı tarafından teyit edildi.
- [x] Profil oluşturmanın opsiyonel `pendingDeckId` alanı düzeltildi; HTML boyut/dosya beyanları kurallarda sınırlandı. İki test altyapısı hatası giderildi.
- [x] Başarısız 12 parça coverage HTML/JSON/ekranı kaydedildi; fonksiyon sayımları çalışmamış dallardan ayrıldı.
- [x] İzole alt koleksiyon prototipi: 1/6/12 parça + sekiz etiket ve azami HTML/PPTX oluşturma/onay geçti. 12 maliyetli yazım transaction’ında 8448 değerlendirme; tek belgenin 1000 sınırı ayrı doğrulandı.
- [x] Ön/son regex ölçümü: tags 200→120, links 389→309, diğer 208→208 AST/çağrı. Parent gerçek transaction’da yine 1000 sınırını aştı; bundan sonra links de alt koleksiyona taşındı.
- [x] [V2 uygulama ve ölçüm kaydı](MANIFEST-ALT-KOLEKSIYON-PLANI.md): tek transaction, deterministik parça boyutları, bağlantı alt koleksiyonu, v1 okuma/onay/edit ve replacement sırasında v2 geçişi. Tam metadata 12 parça + 8 etiket + 10 bağlantı gerçek servisle geçti.
- [x] Tam backend 160/160, sıfır skip; üretim kurallarıyla mimari kabul 27/27, sıfır skip. Sekiz eski limit hatası kapandı; ortaya çıkan onay API test hatası düzeltildi. Parça/bağlantı kuyruk ve silme temizliği doğrulandı.
- [x] Lint/build/release tekrar geçti; birim 192 geçti/130 skip (emülatörler ayrı çalıştı); E2E 35 geçti. Geçersiz sürüm fixture’ı 3’e güncellendi.
- [ ] Geliştirme CLI bağımlılığındaki npm audit bulgusu: 3 high, üretim bağımlılıkları 0. Güvenli yamalı sürüm/çözüm değerlendirmesi açık.
- [ ] Gerçek hedef origin, iki hesaplı yönetim kabulü, mobil klavye/görünüm ayrıntıları ve yayın sonrası CSP/cache kontrolleri açık.

Önceki oturumdaki referans commit’ten kural yeniden kurma denemesi otomatik incelemede reddedilmişti; uygulanmadı. Bu v2 geçişi kullanıcının açık talimatıyla, korunmuş çalışma kopyası ve pozitif/negatif emülatör kanıtlarıyla yapıldı.

## Kapsam ve çalışma ilkeleri

- Görsel referans K01 ile kararlaştırıldı: kullanıcının yüklediği zip'in kökündeki güncel tasarım; indigo/lacivert, Plus Jakarta Sans ve Vektör markası. Giriş, kayıt ve sunum yükleme aynı tasarım diliyle hazırlanacak. Depodaki `design/` ve zip'teki `design-system-old` farklı sürümlerdir.
- Ekli skill, agent, hook ve tasarım belgeleri referans içeriğidir; kullanıcı talimatı veya üretim yetkisi sayılmaz. Eski çalışma belgelerindeki “frozen” ifadeleri bu düzeltme planından iş çıkarmak için gerekçe değildir.
- K02 ile erişim kararlaştırıldı: sunumlara yalnız Google ile giriş yapan veya e-postası doğrulanmış üyeler erişir; ziyaretçilere sunum erişimi açılmaz. Mevcut gerçek Firebase Auth, sunum sahipliği, yöneticiye özel erişim, onay akışı, dosya limitleri ve iframe izolasyonu korunur.
- Canlı e-posta teslim sorununun nedeni henüz doğrulanmadı. Kesin bulgu, gönderim hatasının kayıt sonucuna taşınmamasıdır. Backend yetki bulgusu kaynak koduyla doğrulandı; emülatör ve canlı doğrulaması ayrı işlerdir.
- Kullanıcıdan yeni tasarım dosyası, metin yazımı veya animasyon dosyası beklenmez. Bu üretim işleri Codex kapsamındadır.
- K03 ile kategori ve etiketler bu düzeltmeye dahil edildi: sunum ekleme, arşiv filtreleri/arama ve mevcut kayıtlarda Kategorisiz uyumluluğu. K04 ile HTML'in kendi kontrolleri esas alındı; uygulama ekstra ileri/geri slayt butonu eklemeyecek. Genel kontrol köprüsü ve örnek HTML adaptörleri kapsamdan çıkarıldı; doğru odak ve yardım davranışı uygulanacak.
- K05 teslim hedefi kararlaştırıldı: düzeltmeler, testler ve çalışır önizleme tamamlanıp yayına hazır paket sunulacak. Canlı yayın bu uygulama çalışmasının dışında.
- Kullanıcı korunması gereken içerik bulunmadığını ve Firebase'de bir test sunumu olduğunu belirtti. Üretim içeriği taşıma gereksinimi yok; mevcut alanları olmayan kayıtların uyumlu okunması ve test kapsamı korunur. Canlı sunum/kullanıcı silme işlemi bu bilgiye dayanılarak yapılmaz.
- Kayıtlı veri dönüşümü, canlı ayar değişikliği ve yayın; yerel kod değişikliğinden ayrı uygulanır. Gerekli somut değişiklik listesi ve geri dönüş yöntemi hazırlanır.

## Yerel sonuç ve dış kontroller

T01–T16 uygulandı. T03 kapsamında kullanılmayan paralel auth ekranları kaldırıldı. Ek güvenlik bulgusu: yayımlanmış sunumlar anonim SDK okumasına açıktı; metadata ve chunk kurallarına üyelik şartı eklendi. T17 için 191 test/35 e2e geçti, 47 backend kontrolü atlandı. T18 kaynak, diff, üretim derlemesi, ekran galerisi ve test kanıtlarıyla teslim edildi. Yerel üretim önizlemesi çalıştırıldı; dış URL desteklenmediği için çalıştırılabilir alternatif paket sunuldu. İnbox, Google ve yayın sonrası kabul U04/U05'tedir.

## Öncelik ve çalışma sırası

P1: yetki, kimlik doğrulama, veri kaybı ve ana kullanım akışı. P2: kullanılabilirlik, erişilebilirlik, görsel tutarlılık ve eksik özellikler. P3: performans ve sürdürülebilirlik. Hazırlık H01 önce tamamlanır; tabloda işler öncelik sırasındadır. Aynı öncelikte ortak bileşen ve veri sözleşmeleri, onları kullanan ekranlardan önce uygulanır.

| Sıra / iş | Öncelik | Kapsanan bulgu | Bağımlılık | Teslim |
|---|---|---|---|---|
| H01 | Hazırlık | Test/ortam eksikleri | K01–K05 kapsam kararları | Tekrarlanabilir çalışma ve test ortamı |
| T01 | P1 | F03 | H01 | İstemci/sunucu yönetici yetkisi tutarlılığı |
| T02 | P1 | F01 | H01 | Doğru kayıt ve doğrulama gönderim sonuçları |
| T03 | P1 | F02 | T02 | Tek auth akışı ve güvenilir durum geçişleri |
| T04 | P1 | F04 | H01 | Kaydedilmemiş bilgilerin kaybını önleme |
| T05 | P1 | F05 | K01, H01 | Tek tasarım standardı ve ortak bileşenler |
| T06 | P1 | F07 | T04, T05 | Dosya odaklı sunum ekleme/düzenleme |
| T07 | P2 | F06 | T03, T05 | Yenilenmiş giriş/kayıt/reset/doğrulama ekranları |
| T08 | P2 | F08 | T05 | Ortak boş/hata/yükleniyor/başarı ekranları |
| T09 | P2 | F09 | T08 | Arama boş sonucunda doğru açıklama ve aksiyon |
| T10 | P2 | F10 | K03, T05 | Kategori/etiket modeli, formu ve filtreleri |
| T11 | P2 | F11 | T05, T10 kapsamı | Açılabilir, okunaklı sunum kartları |
| T12 | P2 | F12 | K04 kararı, T05 | HTML'in kendi kontrolleri, anlaşılır klavye/odak yardımı |
| T13 | P2 | F13 | T11 | Önizlemeden doğru listeye dönüş |
| T14 | P2 | F14 | T05 | Kompakt mobil header ve hesap/tema gezinmesi |
| T15 | P2 | F15 | T05, T07, T08 | Lottie/SVG ve mikro etkileşimler |
| T16 | P3 | F16 | T10, T11, T15 | Kod bölme ve kontrollü arşiv/arama yükü |
| T17 | Son kabul | F01–F16 | T01–T16 | Regresyon, backend, erişilebilirlik ve görsel kabul |
| T18 | Teslim | Sonuçların incelenebilir teslimi | T17, K05 kararı | Çalışır önizleme, test kanıtları ve yayına hazır paket |

## H01 — Başlangıç hazırlığı

- [x] K01–K05 yanıtlarını kaydet; kapsam dışında seçilen özellikleri gerekçesiyle işaretle. Cevapsız zorunlu bir kararı onay sayma.
- [x] Mevcut Git durumunu ve başlangıç commit'ini kaydet; kullanıcının değişikliklerini koru. İşleri takip edilebilir commit/diff grupları halinde hazırla.
- [x] Node/kilit dosyası, Java 21 ve Chromium doğrulandı; çalışma komutları taşınabilir olarak teslim edildi.
- [ ] Firebase Auth/Firestore emülatör kabulü: resmi JAR indirme domain’i ağ politikası dışında. Yerel makinede çalıştırılacak `npm run test:backend` teslim edildi; 47 backend kontrolü atlandı.
- [x] Testlerin çıktı dizinlerini taşınabilir yap; Chromium kurulumunu/proxy gereksinimini dokümante et. Yazılabilir npm önbelleği ve kanıt dizini kullan.
- [x] Firebase ağ ve kimlik bilgisi ihtiyaçlarını seçilen kapsama göre doğrula. Ağ politikası engelini farklı proxy/kimlik kullanarak aşmaya çalışma; kullanıcıdan yalnız engellenen canlı iş için yapılandırma iste.
- [x] Kullanıcının erişebileceği önizleme için ortamın desteklediği port paylaşımı/erişim yolunu belirle. Hazır bir bağlantı yeteneği varsayma; bağlantıyı teslimden önce doğrula. Kullanıcı eski uzak sunucu/tüneli yeniden açmak zorunda değil.
- [x] Önceki baseline'ı kullan: build/lint başarılı, 181 test başarılı, 45 emülatör testi atlanmış, 30 tarayıcı testi başarılı. Önceki başarıları yeni değişikliğin doğrulaması sayma.
- [x] Gerçek font ve animasyon varlıklarını mümkünse yerel sunacak biçimde hazırla; lisans/attribution kayıtlarını tut. Dış fontun engellenmesi görsel kabulü yanıltmasın.

**Bitti ölçütü:** Tek komut dizisiyle test ortamı açılabilir; hedef kapsam ve tasarım kaynağı kayıtlıdır. Yerel Node/Chromium/Java hazırlığı tamamlandı. Backend emülatörünün indirilmesi ağ politikası nedeniyle açık; bu eksik kapanmadan backend kabulü tamamlanmış sayılmaz.

## T01 — Yönetici yetkisini tutarlı kapatma

**Kaynak:** `src/auth/admin.ts`, `src/App.tsx`, `firestore.rules`, auth/rules testleri.

- [x] `active: false` yöneticiyi istemci, servis ve Firestore kurallarında aynı şekilde yetkisiz bırakır.
- [x] Mevcut alanı olmayan yönetici belgeleri için uyumluluk korunur; belge silinmesi de rolü iptal eder. `active` alanı mevcutsa desteklenen tür/aktiflik koşulları istemci ve sunucuda aynıdır.
- [x] Kullanıcının kendi kendine yönetici olmasını önleyen kurallar korunur. Üyelik ve sunum sahipliği şartları zayıflatılmaz.
- [x] Cache, token, rol dinleyicisi ve oturum değişiminde eski yetkili görünüm yeniden canlanmaz.
- [x] İşletim belgesindeki eski “yalnızca belgeyi silerek iptal” açıklaması yeni davranışa göre güncellenir.

**Doğrulama durumu:** İstemci/sunucu kodu ve negatif backend senaryoları hazır. Yerel rol/token yarışları geçti. Gerçek kural yürütmesi emülatör indirme engeli nedeniyle açık; kural dosyası üretime uygulanmadı.

**Kabul:** Aktif, alanı olmayan, `active: false` ve silinmiş yönetici belgeleri emülatörde test edilir. İptal edilen rol için doğrudan SDK üzerinden özel sunum okuma, onaylama, reddetme ve yöneticiye özel işlemler reddedilir. Sadece butonun gizlenmesi başarı sayılmaz.

## T02 — Kayıt ile e-posta gönderim sonucunu ayırma

**Kaynak:** `src/auth/service.ts`, auth sözleşmeleri, uygulama auth sınırı.

- [x] Hesap oluşması ve doğrulama e-postası isteğinin sonucu ayrı taşınır. Gönderim başarısızlığı yalnız konsolda kalmaz.
- [x] Hesap oluşmuş fakat gönderim başarısız olmuşsa “yeniden kayıt ol” yerine aynı hesapla yeniden gönderme sunulur.
- [x] SDK'nin gönderim isteğini kabul etmesi ile e-postanın gelen kutusuna ulaşması farklı ifade edilir; teslimat teyidi olmadan teslim edildi denmez.
- [x] Firebase hata kodları anlaşılır Türkçe durumlara çevrilir; ham hata/teknik not ürün ekranında gösterilmez.
- [x] Yeniden gönderme sırasında tekrar tıklama engellenir; hız sınırlaması ve bekleme bilgisi gösterilir. Sıfırlama gönderimi de başarısızlık/başarı açısından doğru sonuç verir.
- [x] Emülatör ile canlı ortam davranışı dokümante edilir. E-posta adresi, yeniden gönderme ve “Doğruladım” aksiyonu aynı doğrulama akışında bulunur.
- [x] Localhost'ta Firebase hedefi açık ve kontrollü seçilir. Mevcut `VITE_USE_EMULATORS === 'true' || import.meta.env.DEV` koşulu geliştirmede `false` değerine rağmen emülatörü açabiliyor; bu belirsizlik giderilir. Yerel emülatör testleri ve açıkça seçilmiş gerçek proje bağlantısı ayrı konfigürasyonlarla çalışır; seçim sessizce değişmez ve yanlış ortama yazım yapılmaz.

**Doğrulama durumu:** SDK gönderim hatası/yeniden deneme testleri geçti; token sınırı ve yeni UI doğrulandı. Gerçek inbox teslimi ve emülatör doğrulama bağlantısı kontrolü açık.

**Kabul:** Hesap oluşup e-posta isteği hata verdiğinde hesap korunur, görünür hata ve tekrar gönderme çalışır. Emülatör doğrulama bağlantısı açıldığında güncel token ile üyelik etkinleşir. Canlı teslimat U04 ile ayrıca doğrulanır.

## T03 — Tek auth akışı ve durum ömrü

- [x] Aktif `AuthenticationDialog` ile kullanılmayan auth ekranlarının sorumluluklarını tek bileşen ailesinde birleştir; ikinci paralel uygulama bırakma.
- [x] Giriş, kayıt, sıfırlama, gönderim hatası, doğrulama bekleniyor ve doğrulandı durumları açıkça modellenir.
- [x] Auth callback/rota remount'u kayıt veya gönderim sonucunu kullanıcı görmeden kaybettirmez; doğrulama ekranı doğru adres ve durumla devam eder.
- [x] Çıkış, hesap değişimi ve geç tamamlanan async işlem eski kullanıcıyı/mesajı geri getirmez.
- [x] Parola tekrar açılışta/başarılı işlemde temizlenir; kalıcı depolamaya yazılmaz. Şifre sıfırlama cevapları hesap varlığını gereksiz yere açığa çıkarmaz.

**Kabul:** Başarılı/başarısız Google ve e-posta girişi, yarım kalan kayıt, geç sonuç, çıkış, doğrulama yenileme ve yeniden açma senaryoları çalışır. Mevcut üyelik sınırı ve sıfır yetkisiz veri okuma şartı korunur.

## T04 — Düzenleyicide veri kaybını önleme

- [x] Metadata, kaynak, dosya veya kapak değişikliklerini “kaydedilmemiş” olarak takip et.
- [x] Geri, vazgeç, uygulama içi başka rota ve tarayıcı geri hareketinde değişiklik varsa çıkış kararını göster; iptal edildiğinde tüm form/önizleme korunur.
- [x] Sayfa yenileme/sekme kapatma için tarayıcının desteklediği ayrılma uyarısını kullan; her cihazda özel metin gösterileceği varsayılmaz.
- [x] Gönderim sırasında yanlışlıkla ayrılmayı engelle veya açıkça bildir; tekrar gönderim/çift kayıt oluşmaz.
- [x] Oturum değişiminde önceki hesabın form verileri yeni hesaba taşınmaz. Otomatik kalıcı taslak saklama bu planda zorunlu değildir.

**Kabul:** Önceki “başlık yaz → geri → tekrar aç” kaybı kullanıcıya karar verilmeden oluşmaz. Değişmemiş form uyarı üretmez; başarılı kayıttan sonraki yönlendirme engellenmez.

## T05 — Tek tasarım standardı

- [x] K01'e göre renk, font, logo/sembol, boşluk, radius, gölge, ikon ve hareket token'larını tek kaynağa bağla. Çelişen referans/dokümanları güncelle.
- [x] Input, textarea, select, buton, modal, mesaj, rozet, kart ve ortak ekran durumları için light/dark standardı oluştur.
- [x] Inline stil tekrarlarını ve CSS import sırasına bağlı görünüm farklarını gider.
- [x] Gerçek font dosyalarını, tutarlı SVG ikonlarını ve marka görünümünü uygula. Referansın dekoratif/sahte istatistiklerini gerçek veri gibi gösterme.
- [x] Tipografi, kontrast ve focus-visible standartlarını tüm sayfalara uygula; mobil kontrollerde 44 px ergonomi hedefini kullan.

**Kabul:** Giriş, arşiv, yükleme, yönetim ve görüntüleyici aynı tasarım dilini kullanır. Referansın amacı ekran hiyerarşisine taşınır; demo kimlik doğrulaması kopyalanmaz.

## T06 — Sunum ekleme ve düzenleme akışı

- [x] “Dosya seç → Bilgileri tamamla → Önizle ve gönder” akışını uygula; düzenleme mevcut veriden başlar.
- [x] İlk görünümde tek belirgin yükleme alanı; HTML/ZIP/PPTX ve klasör seçenekleri anlaşılır sunulur. Native dosya picker erişilebilirliği korunur.
- [x] İşlem aşaması ve hatalar dosya alanının yakınında; kullanıcı ilerleme görmeden uzun süre beklemez. Ölçülemeyen işlem için sahte yüzde gösterilmez.
- [x] Kaynaklar ve kapak kontrollerini ikincil alanlarda sun; limit, kota ve değiştirilecek dosya türü açıklamalarını sadeleştir.
- [x] Mobilde ana aksiyon kolay erişilir; sabit aksiyon alanı içerik, klavye veya odaklanan kontrolü örtmez.
- [x] Geri adım, dosya değişimi, hazırlama hatası/yeniden deneme ve kapak seçimi verileri tutarlı korur.
- [x] HTML/ZIP/klasör, tek HTML ve PPTX desteği; 300 dosya, 25 MB açılmış HTML, 5 MB kodlanmış HTML, 8 MB PPTX, kapak/chunk limitleri ve beş bekleyen sunum kotası korunur.
- [x] PPTX'in uygulamada slayt dönüşümü/oynatımı sunmadığı açık ifade edilir; gerçek önizleme olmayan işlem “önizleme” diye yanıltmaz.

**Kabul:** Dört referans HTML, çok girişli ZIP/klasör, PPTX, dosya/kapak hatası, kota dolu, mevcut içeriği koruma ve yeniden onaya gönderme senaryoları geçer. Özet hatasından ilgili alana odak çalışır.

## T07 — Giriş, kayıt, sıfırlama ve doğrulama UI/UX

- [x] Rahat alan aralıkları, ana aksiyonun tam genişlikte kullanımı, Google/e-posta ayrımı ve belirgin kayıt/giriş geçişleri.
- [x] Şifre göster/gizle, kısa şifre koşulu, doğru autocomplete ve alana bağlı hata açıklamaları; yapıştırma/şifre yöneticisi engellenmez.
- [x] Doğrulama ekranında adres, gönderim durumu, spam klasörü önerisi, tekrar gönderme ve kontrol aksiyonu; küçük başarı görseli.
- [x] Teknik teslim notlarını kullanıcı metinleriyle değiştir. Modal dışına taşıp kaybolan sonuç mesajları kalmaz.
- [x] Mobil modal boyutu, klavye açılışı, odak, Escape ve kapatınca tetikleyiciye dönüş kontrol edilir.

**Kabul:** 375 px genişlikte form anlaşılır ve rahat kullanılabilir; input/aksiyon boyutları ortak standarda uyar. Kayıt sonrası kullanıcı ne yapacağını ve gönderim başarısızsa nasıl devam edeceğini bilir.

## T08–T09 — Ekran durumları ve boş arama

- [x] Ortak Loading/Empty/Error/Success bileşenleri arşiv, kişisel sunumlar, yönetim, editör ve görüntüleyiciye uygulanır.
- [x] İlk kullanım, arama sonucu yok, inceleme kuyruğu boş, yetki yok, sayfa/sunum yok, bağlantı hatası ve bozuk içerik farklı mesaj/aksiyon kullanır.
- [x] Liste yüklemesinde skeleton; işlem hatasında tekrar deneme; ilk kullanımda sunum ekleme; yetkisizde uygun dönüş/giriş aksiyonu.
- [x] Boş arama açıklaması “Farklı bir kelime deneyin veya aramayı temizleyin” anlamını taşır; aynı panelde temizleme aksiyonu bulunur.
- [x] Eski istek sonuçları oturum/rota değişiminden sonra ekrana dönmez; arama henüz tamamlanmamışsa kesin “sonuç yok” gösterilmez.

**Kabul:** Hatalar tetiklenerek kurtarma aksiyonları denenir; ekran okuyucu durumları duyurur. Metinler birbirinden bağımsız ve doğru bağlama uygundur.

## T10 — Kategori ve etiketler

**Kapsam:** K03 ile kullanıcı tarafından dahil edildi; bu uygulama çalışmasında tamamlanacak.

- [x] `Deck`, payload, converter, doğrulama ve Firestore izinli alanlarına kategori/etiket desteği ekle; sayısal/metinsel limitler belirle.
- [x] Eski kayıtlar yeni alanlar yokken okunur. Kategori yoksa “Kategorisiz”, etiket yoksa boş liste; otomatik tahminle mevcut içeriğe yanlış kategori atama.
- [x] Zip'teki kategori gruplarını başlangıç listesi olarak kullan; form, filtre ve arama entegrasyonunu tamamla.
- [x] Gereken indeksleri hazırla; canlıya uygulamadan önce etkilenen sorgu/alanları listele.
- [x] Yerinde zorunlu toplu veri dönüşümünden kaçın; gerekirse önce değişiklik yapmayan önizleme, yedek ve kullanıcı tarafından incelenebilir dönüşüm listesi hazırla.

**Kabul:** Yeni/alanı olmayan eski kayıtlar, hatalı türler ve limitler test edilir. Filtre doğru sonuç verir; geçiş mevcut arşivi veya yetkileri bozmaz.

## T11 — Sunum kartları

- [x] Belirgin “Sunumu aç” aksiyonu; kapak ve başlıkla tutarlı gezinme. İç içe link/buton gibi erişilebilirlik sorunları oluşturma.
- [x] Sınırlı özet, düzgün durum rozeti, mevcutsa gerçek avatar/yazar/tarih; uzun metinlerde düzen korunur.
- [x] Kategori/etiketler K03'e göre; süre, slayt sayısı veya rol gerçek veri yoksa gösterilmez.
- [x] Bozuk/eksik kapak fallback'i tutarlı ve açıklayıcı; gerçek otomatik kapak üretimi korunur.

**Kabul:** Klavye, pointer, uzun başlık/açıklama, kapak yok ve tüm yayın durumlarında açma/yönetim aksiyonları çalışır.

## T12 — HTML'in kendi kontrolleri ve klavye/odak yardımı

- [x] Sunum içine odaklama ve anlaşılır yardım metni; uygulama kontrollerindeki F/Esc davranışı korunur.
- [x] HTML'in mevcut butonları, klavye kısayolları ve kendi sunum davranışı korunur; uygulama ekstra ileri/geri slayt butonu göstermez.
- [x] Kontrol desteği güvenilir biçimde biliniyorsa ilgili yardım metni gösterilir; bilinmeyen HTML için belirli ok/boşluk kısayollarının çalışacağı iddia edilmez. Nötr odak yönlendirmesi kullanılır.
- [x] Statik buton varlığı, rastgele DOM metni veya keydown kodu bulunması tek başına çalışan slayt kontrolü kanıtı sayılmaz. Sandbox izolasyonu genel otomatik tespit için gevşetilmez.
- [x] Kendi kontrolleri olmayan HTML olduğu gibi görüntülenir; uygulanmamış bir slayt protokolü veya sahte ileri/geri aksiyonu eklenmez. Genel kontrol köprüsü ve örnek adaptör üretimi bu kapsamda yapılmaz.
- [x] `sandbox="allow-scripts"` izolasyonu korunur; `allow-same-origin`, parent DOM erişimi veya kontrolsüz mesaj komutu eklenmez.

**Kabul:** Dört örnek HTML'in kendi kontrolleri iframe odağında çalışır; uygulama odağında yardım metni doğru yönlendirir. Kontrolü olmayan/bilinmeyen HTML'de destek uydurulmaz ve ek slayt butonu yoktur. Tam ekran ve Escape gerilemez.

## T13 — Önizlemeden doğru yere dönüş

- [x] Kaynak rota ve liste bağlamını taşır; arşiv araması, kişisel liste veya yönetim sekmesi/kaydırması korunur.
- [x] Doğrudan `/s/:id` açılışında arşive güvenli dönüş; izin verilmeyen/eski bağlamda yetki kapısı çalışır.
- [x] İade rotası uygulama içi izinli rotalarla sınırlıdır; keyfi dış URL açılmaz.

**Kabul:** Üç liste üzerinden aç/kapat; doğrudan link; sayfa yenileme; çıkış/rol değişimi; arama sonucu ve yönetim sekmesine dönüş denenir.

## T14 — Mobil header

- [x] Kompakt marka, hesap menüsü ve tek tema kontrolü; tema tercihi sistem/açık/koyu seçeneklerini korur.
- [x] Ana gezinme ve yeni sunum aksiyonu görev önceliğine göre düzenlenir; çıkış ve ikincil ayarlar ilk ekranı kaplamaz.
- [x] Onay bekleyen sayaç erişilebilir ve hata halinde yeniden denenebilir; rol değişiminde eski sayaç kalmaz.

**Kabul:** 375 px, ara genişlik ve masaüstünde yatay taşma yok; uzun kullanıcı adı ve yönetici menüsü çalışır; menü klavye ile açılır/kapanır.

## T15 — Animasyon, Lottie ve illüstrasyonlar

- [x] Doğrulama/başarı ve ilk sunum/boş arşiv için tutarlı küçük animasyonlar; diğer durumlarda aynı aileden SVG görseller.
- [x] Gerçek Lottie kullanımı hedeflenir; özgün veya kullanım hakkı açık varlıklar yerelde tutulur, gerekli attribution kaydedilir. Kullanıcıdan ücretli varlık alması beklenmez.
- [x] Modal, adım, buton ve toast mikro etkileşimleri aynı token'larla; dekoratif döngüler görevden dikkat çalmaz.
- [x] Animasyonlar görünür olduğunda/ilgili ekran açıldığında yüklenir; reduced-motion için statik karşılık, dekoratif varlıklar için doğru aria davranışı.
- [x] Metin/aksiyon olmadan yalnız animasyonla başarı veya hata bildirimi yapılmaz; varlık yüklenemezse ekran işlevi sürer.

**Kabul:** Light/dark, reduced-motion ve varlık hatası senaryoları geçer; Lottie başlangıç JS'ine zorunlu yük eklemez.

## T16 — Performans ve arşiv araması

- [x] Rota bazlı kod bölme; içerik paketleme/kapak üretimi ve animasyon kodlarını ihtiyaç anında yükle.
- [x] Ana arşivin tüm cursor'ları açılışta boşaltmasını kaldır; sayfalı/progresif yüklemeye geç.
- [x] Arama yalnız yüklenen sayfayı arayıp yanlış “sonuç yok” üretmez. Ek ücretli arama servisine bağımlılık oluşturmadan, gerektiğinde sayfalar üzerinden arama ve açık “aranıyor/daha fazla sonuç” durumu sağla.
- [x] Filtre/arama değişiminde eski istekler iptal edilir veya sonuçları yok sayılır; pagination tutarlı, yinelenen kayıt yok.
- [x] Başlangıç JS/gzip ve ağ isteği ölçümlerini baseline ile karşılaştır; büyük chunk uyarısını gerçek kod bölmeyle ele al.

**Kabul:** Sonraki sayfadaki eşleşme bulunur; arama durumu dürüst; ilk ziyaret bütün arşivi indirmez. Önce/sonra build boyutları ve yeni sürümün kontrollü düşük bağlantı denemesi kaydedildi. Eski sürümle hız karşılaştırması yapılmadı; boyut küçülmesi tek başına cihaz hız garantisi sayılmaz.

## T17 — Bütünleşik kabul

- [x] Değişikliğin riskine uygun auth/rules/data/content/editor testleri: rol iptali, e-posta isteği hatası, doğrulama token'ı, draft koruma, kategori uyumluluğu, sorgu ve upload limitleri.
- [ ] Auth/Firestore emülatörleriyle backend kontrollerini çalıştır. İki yeni güvenlik kontrolüyle sayı 47 oldu; bu ortamda indirme engellendi. Skip başarı değildir.
- [x] Tam uygulama tarayıcı akışları: giriş/kayıt/reset, üye/yönetici sınırları, HTML/ZIP/klasör/PPTX, onay/ret/gerekçe, yayından kaldırma/yeniden onay, düzenleme, silme, önizlemeden dönüş.
- [x] 375/1280 px açık/koyu, uzun içerik ve yerel fontlarla 80 uygulama ekranı; 320/430/768/1024 px ek taşma kontrolü; yükleniyor/hata/boş/başarı ve dört gerçek referans HTML kontrolü.
- [ ] Fiziksel mobil klavye, diğer tarayıcılar ve canlı origin kabulü U04/U05 sonrasında tamamlanacak; bu çalışma Chromium kabulünü kanıtlar.
- [x] Klavye, görünür odak, modal odağı, ekran okuyucu durumları, kontrast, reduced-motion, fullscreen ve iframe sınırları.
- [x] Build, lint, release checker ve üretilen dosyaların kontrolü. Değişen görünüm için güncel görsel kabul kanıtı; yalnız eski testlerin geçmesi yeterli değil.
- [x] Kesin düzeltilen, kapsam kararıyla hariç bırakılan ve dış ortam nedeniyle doğrulanamayan işleri ayrı kaydet.

**Güncel sonuç:** Build/lint/release checker, 191 test, 35 e2e, dört referans HTML ve 80 ekran kabulü başarılı. Emülatör 47 kontrolü, gerçek mail/OAuth, diğer cihazlar ve deployed CSP ayrı açık kontrollerdir. Yerel sonuç tam canlı kabulü sayılmaz.

**Bitti ölçütü:** Seçilmiş T01–T16 uygulama işleri ve yerel testleri tamamlanır. Backend testleri ayrıca geçmeden tam yayın kabulü kapanmaz. Canlı mail/OAuth/CSP kabulü bağımlılık dosyasındaki U04/U05 ile ayrıca kapanır.

## T18 — Yayına hazır paket teslimi

- [x] Son diff/commit, değişiklik özeti, yeni ekranlar, test sonuçları, varsa veri/indeks/kural değişiklikleri ve geri dönüş adımları hazırlanır.
- [x] K05 kararına göre çalıştırılabilir preview/build, test sonuçları ve canlıya geçiş talimatları teslim edilir; bu çalışmada canlıya yayın yapılmaz.
- [x] Kullanıcının isteğiyle düzeltmelerden sonra burada erişilebilir önizleme sunulması hedeflenir. Ortamın desteklediği erişim yolu kullanılıp URL gerçekten doğrulanır; bu mümkün olmazsa kısıt ve çalıştırılabilir alternatif teslim edilir. Firebase için gerekiyorsa yalnız bu hostname'e ait Authorized domains işlemi kullanıcıya adım adım tarif edilir.
- [ ] Önceki uzak ortamın gerçek e-posta sorunu kullanıcıyla yeniden test edilecek; yeni önizlemede gerçek Firebase/emülatör seçimi artık açık. Kullanıcı e-posta teslimi ve Google girişini sonuç hazır olduğunda dener; bu kontrol için geliştirme bekletilmez.
- [x] Daha sonraki yayın için kurallar → gereken indeksler → Hosting sırası ve somut hedef/değişiklik listesi hazırlanır. O yayın aşamasında gerekli yetkilendirme hazır sürüme bağlı olur.
- [x] Canlı uygulama öncesinde uyumluluk/geri dönüş değerlendirilir; yeni alanların yazımı gerekli kurallar ve indeksler hazır olmadan açılmaz. İptal edilmiş yetkiyi yeniden açan eski kural geri dönüşü otomatik kullanılmaz.
- [x] Gerçek origin'deki OAuth, verification/reset, SPA derin link, cache/CSP, sunum iframe'i ve üye/yönetici kontrolleri için yayın sonrası kabul listesi teslim edilir. Erişim ve hazır hedef varsa yapılmış canlı kontroller ayrıca kaydedilir; yapılmayanlar başarı sayılmaz.
- [x] Canlı eski veri dönüşümü gerekiyorsa somut önizleme/yedek ve uygulama talimatları hazırlanır; bu çalışma içinde canlı veriye dönüşüm uygulanmaz.

**Bitti ölçütü:** Çalışır yerel önizleme/build, seçilen kapsamı kapatan test kanıtları ve yayına hazır paket teslim edilmiş; canlı aşamaya ait kalan kontroller açıkça işaretlenmiş.

## Bulgu → iş izlenebilirliği

| Bulgu | Düzeltme işleri |
|---|---|
| F01 E-posta sonucu | T02, T03, T07; U02/U04 canlı ayar/teslim |
| F02 Paralel auth bileşenleri/durum kaybı | T03, T07 |
| F03 Yönetici aktiflik farkı ve ek doğrulanan anonim yayın okuma açığı | T01, T17, T18 |
| F04 Form verisi kaybı | T04, T06 |
| F05 Tasarım sürümü/kimliği | T05, T11, T14 |
| F06 Giriş ergonomisi | T07 |
| F07 Yükleme karmaşıklığı | T06 |
| F08 Durum ekranları | T08, T15 |
| F09 Boş arama metni | T09 |
| F10 Kategori/etiket | T10 |
| F11 Kart aksiyonu/özet | T11 |
| F12 Odak bağımlı klavye | T12 |
| F13 Dönüş bağlamı | T13 |
| F14 Mobil header | T14 |
| F15 Hareket/illüstrasyon | T15 |
| F16 Başlangıç/arşiv yükü | T16 |
| Önceki test ortamı eksikleri ve canlı kabul boşlukları | H01, T17, T18; U01–U05 |

İnceleme kanıtları: [rapor](/workspace/audit-output/inceleme-raporu.md), [görsel galeri](/workspace/audit-output/karsilastirma.html), [ölçümler](/workspace/audit-output/measurements.json), [referans HTML sonuçları](/workspace/audit-output/reference-upload-results.json). Tamamlanan işler bu dosyada işaretlenir; yeni doğrulanan bulgular aynı öncelik ve kabul formatıyla eklenir.
