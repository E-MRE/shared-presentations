# UI ve inceleme bulguları — 6 Ekim 2026

Devam teslimi: önizleme artık pencere açar; kapak kartında yükleme/hazır kapak sekmeleri vardır; geçici işlem sonuçları ortak sabit bildirimlerle gösterilir. [Detay ve kontrol adımları](ONIZLEME-VE-BILDIRIM-RAPORU.md).

Kullanıcının “bitti” mesajından sonra uygulanan toplu düzeltme. Başlangıç kodu: `8aa2390`. Ekran görüntülerindeki diğer siteler yalnız etkileşim referansı; renkleri veya dosya işleme iddiaları kopyalanmadı. Bu oturumda Impeccable skill'i bulunmadı; Vektör'ün mevcut tasarım dili korundu.

| Öncelik | İş | Son durum |
|---|---|---|
| P1 | I01: bağımsız sayaç azaltarak 5 bekleyen sunum kotasını aşma | Kural, önceki sunumun hedef kullanıcıya ait ve pending olmasını, işlem sonunda pending'den çıkmasını/silinmesini zorunlu kılıyor. Admin sayaç değişikliği başka profil alanlarını değiştiremiyor. 6 negatif regresyon dahil yeni kurallarla backend kabulü 174/174, sıfır skip geçti. |
| P1 | I02: tek eksik/geçersiz bağlantının bütün listeyi kapatması | Arşiv, kendi sunumları ve onay kuyruğu yalnız üst belgeyi okuyor. Yönetici işlem sonrası bağlantı okumuyor; kusurlu sunumu reddetme/silme mümkün. Detayda kaynaklar ayrıca doğrulanıyor; kusurlu kayıt kendi detayında hata verir. |
| P1 | Tek HTML'de “Dosyalar hazırlanamadı” hatası | Basit HTML ve dört tasarım HTML'i hazırlandı; kullanıcının dosyasındaki hata yeniden üretilemedi. Dosya okuma ve lazy modül indirme hataları ayrıldı. Modül hatası artık yenileme yönlendirmesi veriyor; buna özel tarayıcı testi eklendi. Kullanıcının aynı dosyayla yeni sürümü denemesi gerekiyor. Kök neden kesinleşmedi. |
| P2 | I03: 12 kart için 120 gereksiz kaynak okuması | Liste kaynak okuması sıfır. Detay açılınca kaynaklar okunuyor. 5 gerçek servis/mock taşıma regresyonu eklendi. |
| P2 | I04: Firebase CLI → chokidar → braces audit zinciri | Açık. Registry'deki en yeni CLI 15.32.1/braces 3.0.3; uyumlu düzeltme yok. Production audit sıfır. CLI'yi eski sürüme zorla düşürme/uyumsuz chokidar major override uygulanmadı. |
| P2 | Sol alttaki “Çıkış yapıldı” ve diğer kalıcı ortak başarı yazıları | Ortak sayfa altı başarı metni kaldırıldı. Doğrulama geri bildirimi yalnız doğrulama ekranında gösteriliyor. |
| P2 | Sayfada kalan “Sunum silindi” | Benim Sunumlarım'da 4 saniyelik bildirim; üzerine gelme/odakta süre durur, kapatılabilir. Listeye kalıcı metin yazılmaz. |
| P2 | İki navigasyon öğesi seçili gibi görünüyor | Yeni Sunum diğer bağlantılarla aynı normal stile sahip. Aktif sayfada indigo zemin/alt çizgi ve aria-current var. |
| P2 | Arşivde tekrar eden başlık/açıklama/arama etiketi | Başlık altı tekrar kaldırıldı. Beğenilen kutu korundu, üst slogan kaldırıldı. Görünen “Sunum ara” yok; erişilebilir etiket korunuyor. Arama kutudan sonra, kategori filtrelerinden önce. |
| P2 | Boş listede “0 sunum” | Arşiv ve kendi listesinde kaldırıldı; boş durum ekranı yeterli. Sonuç olduğunda sayı ve sayfalama kapsamı görünür. |
| P2 | Tema dropdown | Tek ikonlu düğme; tıklayınca açık/koyu tema ve ikon değişir. Tercih kalıcı; ilk ziyaret sistem temasını kullanır. |
| P2 | Yükleme seçeneklerinde buton/native input kalabalığı | HTML Klasör/ZIP, Tek HTML ve PowerPoint sekmeleri; yalnız ilgili seçimler ve sınırlar görünür. Ok tuşları/Home/End destekli. Klasör sürükleme, tarayıcının parçalı dizin okumaları ve sınır kontrolü var. |
| P2 | Tek ekranda yanıltıcı stepper | Hem masaüstü hem mobilde kaldırıldı; gerçek ilerleme durumu hazırlama sırasında görünür. |
| P2 | Kaynak bağlantılarının kapalı paneli | Açık bölüm; ilk boş etiket/URL satırı, bağlantı ekleme ve kaldırma, 10 bağlantı sınırı. Tamamen boş satır isteğe bağlıdır ve kaydedilmez; yarım doldurulan satır doğrulanır. |
| P2 | Giriş sayfasında iki Giriş Yap düğmesi | Üst bardaki kaldırıldı; sayfa içi düğme korunuyor. |
| P2 | Şifre etiketi ve Şifremi unuttum aynı satırda | Kurtarma bağlantısı şifre alanının altında. E-posta/kilit ikonları, erişilebilir göz düğmesi; autocomplete ve mevcut giriş davranışı korunuyor. |
| P2 | Kayıt modalında iki benzer tanıtım mesajı | İkonlu ikinci slogan kaldırıldı; başlık ve tek açıklama kaldı. |
| P2 | Admin nasıl atanır/mevcut admin var mı? | Kod/kurallar `admins/{UID}` ve boolean active kontrol ediyor. Canlı yönetim erişimi bulunmadığı için mevcut kayıt doğrulanamadı. Console adımları bağımlılık dosyasında. |

Test ve teslim sonucu: [UI teslim raporu](UI-TESLIM-RAPORU.md), [ağ erişimi açıldıktan sonraki doğrulama](EMULATOR-TAMAMLAMA-RAPORU.md). Kullanıcı/ortam işleri: [Bağımlılıklar](KULLANICI-BAGIMLILIKLARI.md).
