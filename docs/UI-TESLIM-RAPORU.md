# UI düzeltme teslimi — 6 Ekim 2026

**Güncel durum:** Son kart/editör/admin düzenlemeleri `d5bc1b3` ile teslim edildi; kullanıcı tarayıcıda teyit etti. Firestore kuralları 6 Ekim 14:24'te yayımlandı ve birebir karşılaştırıldı. Hosting 6 Ekim 16:07'de yayımlandı; aynı paket 16:35'te kullanıcı seçimiyle **https://vektor-sunum.web.app** adresine kopyalandı ([alan adı geçişi](DOMAIN-GECISI-2026-10-06.md)); [canlı doğrulama kaydı](HOSTING-YAYINI-2026-10-06.md). Localhost önizlemesi durduruldu. [Son düzenleme, yayın ve secret taraması kaydı](UI-SON-DUZELTMELER-2026-10-06.md).

Son kullanıcı geri bildirimiyle önizleme penceresi, kapak seçimi ve ortak geçici işlem bildirimleri eklendi: [güncel değişiklik raporu](ONIZLEME-VE-BILDIRIM-RAPORU.md). Aşağıdaki UI davranışları ilk teslimi anlatır.

Kullanıcının toplu ekran görüntüleri ile önceki I01–I04 incelemesi birlikte ele alındı. UI değişiklikleri, liste izolasyonu/okuma azaltma ve kota kuralı düzeltmesi uygulandı. **Bu ilk UI tesliminde canlı yayın yapılmamıştı; kullanıcının hatalı HTML dosyasının kök nedeni bağımsız doğrulanmadı.** Ağ erişimi açılınca değişen kuralların backend kabulü **174/174, sıfır skip** tamamlandı; devam doğrulaması [emülatör tamamlama raporunda](EMULATOR-TAMAMLAMA-RAPORU.md). Aşağıdaki tablo ilk UI tesliminin tarihsel sonuçlarını korur.

## Değişen davranış

- Ortak alt köşedeki başarı yazısı kaldırıldı. Benim Sunumlarım'daki silme sonucu kalıcı satır yerine 4 saniyelik, kapatılabilir bildirim. Boş listede 0 sunum tekrar etmiyor.
- Navigasyonda yalnız gerçek sayfa seçili; tema tek tıkla ve ikonla değişiyor. Giriş ekranının üst barında ikinci giriş düğmesi yok.
- Arşivde başlık altı tekrar ve kutunun üst sloganı kaldırıldı. Beğenilen kutu korundu. Görünen arama etiketi kaldırılırken erişilebilir ad korundu; arama ve kategoriler içerik listesinden hemen önce.
- Yükleme, HTML Klasör/ZIP, Tek HTML ve PowerPoint sekmelerine ayrıldı. Sadece ilgili düğmeler/sınırlar görünür. Klasör sürükleme parçalı dizin okumalarını tüketir; sayı/boyut sınırı uygulanır. Tek ekranda gerçek adımı olmayan stepper kaldırıldı.
- Kaynaklar baştan açık, etiket/URL yan yana; boş isteğe bağlı satır kaydedilmez. Giriş alanlarında ikonlar, erişilebilir göz kontrolü, ayrı şifre kurtarma satırı var; kayıt modalında tek açıklama kaldı.
- Liste sorguları v2 bağlantı çocuklarını okumaz; 12 × 10 kaynakta ekstra okuma 120'den 0'a indi. Bir eksik kaynak artık bütün listeyi kapatmaz. Detay/editor kaynakları getDeck ile doğrulanır; bozuk kaynak o kaydın detayında hata verir. Yönetici işlemi sonrası tekrar kaynak okumaması, kusurlu kaydın reddedilmesini/silinmesini mümkün kılar.
- Sayaç azaltma önceki pending sunuma, doğru sahibine ve gerçek çıkış/silme işlemine bağlandı. Admin işleminin ilgisiz profil alanlarını değiştirmesi engellendi. Boş/Unicode boşluklardan oluşan kaynak etiketi backend kuralında reddediliyor.

## HTML hatasının sınırı

Kullanıcı tek .html seçiminde hata aldığını belirtti. Burada basit HTML, dört tasarım HTML'i, ZIP ve PPTX hazırlama/önizleme geçti. Kullanıcının dosyası üzerinde aynı hata yeniden üretilemedi; kesin kök neden veya tam kapanış iddiası yok.

Lazy hazırlama modülü indirilemezse eskiden genel “Dosyalar hazırlanamadı” görünüyordu; artık sayfayı yenileme yönlendirmesi var. Dosya okunamaması ayrı ve uygulanabilir mesajla açıklanıyor. Modül indirmesinin engellenmesi gerçek tarayıcıda ayrıca test edildi. Güncel build ile aynı dosyanın denemesi [bağımlılıklarda](KULLANICI-BAGIMLILIKLARI.md#3-aynı-html-dosyasını-yeni-sürümde-yeniden-dene).

## Doğrulama

| Kontrol | Sonuç / kapsam |
|---|---|
| Lint, TypeScript/Vite build, release kontrolü | Geçti; release 0 başarısız |
| Tam birim paketi | 200 geçti, 139 emülatör/prototip senaryosu atlandı; 19 dosya geçti, 6 dosya skip. Skip başarı sayılmadı. |
| Tam E2E | **41 geçti, 0 başarısız, 0 skip.** Özeti kanıt dizininde; gerçek Chromium, gerçek React/SDK uygulama bileşenleri, kontrollü servis/auth taşıması. Canlı Firebase onayı değildir. |
| Yeni regresyonlar | 5 servis liste/detay testi; 3 klasör drop testi; 6 E2E UI/hata akışı; 9 yeni kural senaryosu (emülatör bekliyor). |
| Görsel inceleme | Arşiv/yükleme 375 ve 1280 px, açık/koyu; yatay taşma yok. Tema ikonu 22 × 22 px. Giriş ve kayıt modalları da görüntülendi. |
| Backend | JAR indirmesinde ağ engeli; testler başlamadı. Önceki 160/160 sonucu yeni kurallar için kullanılmadı. |
| npm audit | Production 0; tüm bağımlılıklarda aynı CLI zincirinin 3 high paket girdisi. Uyumlu upstream düzeltme yok. |

[Kanıtlar ve ekran galerisi](kanit/ui-duzeltme-2026-10-06/galeri.html), [kanıt özeti](kanit/ui-duzeltme-2026-10-06/ozet.json).

İlk birim turunda iki eski drag/drop testi sekme seçimi ve sınır mesajları nedeniyle başarısız oldu; düzeltme sonrası editör 21/21 ve tam paket 200/200 geçti. İlk E2E turundaki sistem-teması test kontrolü ve görünmez erişilebilir etiketin Playwright görünürlük ölçümü düzeltildi. Sonraki turda rol/navigasyon test kontrolü commit beklemeden rol değiştirdi; fixture gezinmesi senkronlaştırıldı, ilgili senaryo beş ardışık tekrarda geçti. Bunlar ürünün başarısız testlerini gizlemek için retry olarak sayılmadı; son tam çalışma ayrı kaydedildi.

## Açık işler ve teslim

[Öncelikli iş listesi](UI-DUZELTME-PLANI.md) ve [kullanıcı/ortam dosyası](KULLANICI-BAGIMLILIKLARI.md) güncel. Admin belgesi `admins/{UID}` / boolean active=true; canlı kaydın varlığı bu ortamdan doğrulanamadı. Console adımları dosyada.

İlk UI tesliminin kaynak, test, kural ve belgeleri GitHub'a gönderildi; son UI kodu `d5bc1b3` içinde. Dist izlenmeyen build çıktısıdır; kendi ortamında npm ci / npm run build ile yeniden üretilir. İlk teslimde kurallar ve Hosting değiştirilmemişti; daha sonra kurallar ve ardından Hosting yayımlandı. Önizleme yeniden başlatıldığında kendi cihazında localhost:4175 ile denenebilir.
