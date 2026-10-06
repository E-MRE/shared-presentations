# Önizleme, kapak ve işlem bildirimleri — 6 Ekim 2026

“Sunumu önizle” artık formun sonunda içerik açmak yerine görünür bir pencere açar. Kapak kartı, sunum dosyası seçimiyle aynı görsel düzeni kullanır. Geçici işlem sonuçları sayfanın altında kalan metinlerden ortak, ekranda sabit bildirimlere taşındı.

## Değişen davranış

- Önizleme, geniş bir native dialog içinde açılır. HTML aynı opaque sandbox içinde çalışır. Pencere açıkken arka plan kaydırması durur; kapatma düğmesi ve Escape desteklenir, kapanınca odak önizleme düğmesine döner. Mobilde pencere ekrana sığar. PPTX için dosya bilgisi gösterilir; dönüşüm yapılmaz.
- Kapak kartında **Görsel yükle / Hazır kapak** sekmeleri vardır. Yükleme sekmesi tek görsel seçimi/sürüklemesi ve anlaşılır format/boyut bilgilerini gösterir. Hazır kapak sekmesi mevcut olan otomatik, varsayılan ve eski kapak seçeneklerini gösterir. Ok tuşları/Home/End çalışır. Görsel işlenemezse önceki kapak korunur.
- Kapak yakalama başarısızlığı ve normalizasyon gibi teknik hazırlama ayrıntıları gösterilmez. Görünümü etkileyebilecek eksik/güvensiz kaynaklar kısa bir önizleme kontrolü notuyla; harici HTTPS kaynakları tek bir internet bağımlılığı notuyla özetlenir. Ham URL'ler ve hata listeleri kullanıcıya yazılmaz. Pipeline tanılama bilgileri korunur.
- İşlem bildirimleri ekranın alt ortasına sabitlenir; belge sonuna kaydırmak gerekmez. Başarı/bilgi varsayılan 4 saniye, hata 8 saniye görünür; üzerinde fare veya klavye odağı varken süre durur. Kullanıcı kapatabilir. Aynı işlemin tekrar mesajı öncekinin yerini alır.
- Yükleme/kaydetme, kapak/önizleme hataları, kendi sunumunu silme, yönetici işlemleri, giriş/çıkış, doğrulama/sıfırlama ve dosya indirme aynı sistemi kullanır. Bildirimler açık native dialog ve tam ekran içinde de görünür ve kapatılabilir.
- Alan doğrulama mesajları ilgili alanın yanında ve odaklanabilen özette; yüklenemeyen liste/sunum durumları yeniden deneme kontrolleriyle kalır. Bunlar kullanıcıya düzeltilecek yeri gösterir. Başarılı gönderim bildirimi yönlendirmeden önce oluşturulur; hata sonrası form ve seçilen dosya korunur.

## Beş bekleyen sunum hatası

Servis, canlı kullanıcı belgesindeki `pendingCount` değerini işlem içinde okur; değer 5 veya daha büyükse yeni sunumu `QUOTA_EXCEEDED` ile reddeder. Bu sınır artırılmadı. Bildirim artık Benim Sunumlarım'dan bekleyenleri kontrol etmeyi ve inceleme tamamlandıktan veya bir bekleyen sunum silindikten sonra tekrar denemeyi açıklar. Bekleyen bir sunumu düzenlemek yeni kota tüketmez.

Bu ortamda gerçek hesabın profil sayacı okunmadı. Benim Sunumlarım'da gerçekten beşten az bekleyen kayıt varken aynı hata görülürse canlı profil sayacı ve kayıtların birlikte incelenmesi gerekir; hata mesajından tek başına sayaç tutarsızlığı sonucu çıkarılamaz. Sayacı elle azaltarak kuralları aşmak çözüm değildir.

## Tarayıcıda kontrol et

```bash
git pull --ff-only
npm ci
npm run build
npm run preview -- --host 0.0.0.0 --port 4175
```

`http://localhost:4175` adresinde ve aynı ağdaki telefonda makinenin güncel IP'si/4175 portuyla:

1. Aynı HTML dosyasını hazırla; **Sunumu önizle** ile pencerenin hemen açılmasını, içeriği, kapatmayı ve formun korunmasını kontrol et.
2. Kapak görseli seç/sürükle; Hazır kapak seçenekleriyle geçiş yap. Görsel yükledikten sonra sunum dosyasını değiştirmek seçtiğin kapağı korumalı.
3. Tekrar onaya gönder; kota/hata bildirimi bulunduğun kaydırma konumunda görünmeli. Başarısız gönderimde başlık ve dosya korunmalı. Bekleyenlerin sayısını Benim Sunumlarım'dan kontrol et.
4. Giriş/çıkış, kendi test sunumunu silme ve yönetici işlem bildirimlerini kontrol et. Silme/onay gerçek veriyi değiştirir; yalnız test kayıtları kullan.

Canlı Hosting/Firestore yayını yapılmadı. Yerel build canlı kuralları değiştirmez. Admin ataması, aynı hatalı dosyayla kullanıcı kabulü ve yayın sırası [kullanıcı adımlarında](KULLANICI-BAGIMLILIKLARI.md).

## Doğrulama ve kanıt

| Kontrol | Final sonuç |
|---|---|
| Lint, TypeScript/Vite build, yerel release kontrolü | Geçti; release 0 başarısız. |
| Tam birim paketi | 200 geçti, 0 başarısız; ayrı emülatör/prototip komutlarına ait 139 senaryo bu pakette atlandı. |
| Tam E2E paketi | 46 geçti, 0 başarısız, 0 skip, 0 retry. |
| Son bildirim stili ve mobil ölçüm kontrolü | 5/5 yeni geri bildirim senaryosu tekrar geçti; gerçek toast merkezi ve ekran sınırları ölçüldü. |

Yeni beş tarayıcı senaryosu önizleme penceresini/odak geri dönüşünü, kota hatasında sabit görünürlüğü/form korunmasını/tekrarı/yeniden denemeyi, gerçek kapak sürükleme ve klavye sekmelerini, native dialog ve fullscreen üzerindeki bildirimi kapsar. Tam E2E'den sonra bildirim genişliğini etkileyen temel stil çakışması düzeltildi; son build/release ve bu beş senaryo final CSS ile çalıştırıldı. Kota/Firestore kuralları değişmedi; yeni kuralların önceki **174 backend + 27 manifest/prototip, sıfır skip** kabulü [emülatör raporunda](EMULATOR-TAMAMLAMA-RAPORU.md).

Final sonuçlar [kanıt özetinde](kanit/onizleme-bildirim-2026-10-06/ozet.json), seçili ekran görüntüleri [galeride](kanit/onizleme-bildirim-2026-10-06/galeri.html) kaydedildi. Aynı dizindeki birim/E2E/son geri bildirim JSON kayıtları test adlarını ve durumlarını içerir. Testler gerçek Chromium/React bileşenlerini ve kontrollü test servislerini kullanır; canlı hesabın kota sayacı için kabul değildir.

İlk test turlarında eski sayfa içi hata seçicileri, tek dropzone varsayımı ve eski e-posta gönderim metni beklentileri yeni UI'a uyarlandı. Süre testi, bildirim üzerine gelen fare nedeniyle durduğundan imleç bildirim dışına taşındı. Görsel incelemede refresh stilinin geniş önizlemeyi 500 px'e daraltması düzeltildi ve masaüstü genişliği ayrıca doğrulandı. Final testlerde retry başarıya sayılmaz.
