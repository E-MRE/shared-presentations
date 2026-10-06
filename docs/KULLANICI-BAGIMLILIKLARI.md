# Kullanıcı ve ortam bağımlılıkları — 6 Ekim 2026

UI düzeltmeleri için başka tasarım kararı gerekmiyor. Bu dosya önceki bağımlılık listesinin güncel karşılığıdır; tarihsel test sonuçları SON-KONTROL-RAPORU.md ve Git geçmişinde korunuyor.

Gerçek doğrulama e-postası, şifre sıfırlama/yeni şifre, Google hesap seçimi/iptal/giriş, 60 saniyelik yeniden gönderme ve fiziksel telefonda giriş kullanıcı tarafından önceki sürümde test edildi. Bunlar yeniden bekleyen iş olarak listelenmiyor. Firebase bağlı; Firestore ve e-posta/Google sağlayıcıları etkin. Test sunumu için içerik koruma bağımlılığı yok.

## 1. Yeni kuralların emülatör doğrulaması — burada tamamlandı

**Senden işlem gerekmiyor:** Ağ erişimi açıldı; Firestore JAR indirildi ve `08eabdf` kaynak/kuralları ile backend kabulü **174/174**, manifest/prototip **27/27**, ikisi de **sıfır skip** geçti. Yeni bağımsız sayaç azaltma retleri, Unicode boş bağlantı etiketi retleri, olumlu kota geçişleri ve 12 parça + 8 etiket + 10 bağlantı birlikte doğrulandı. Güncel sonuçlar ve kanıtlar [emülatör tamamlama raporunda](EMULATOR-TAMAMLAMA-RAPORU.md).

İstersen Node 24 LTS ve Java 21 ile kendi ortamında da tekrarlayabilirsin:

```bash
git pull --ff-only
node --version
java --version
npm ci
npx playwright install chromium
npm run test:backend
npm run test:manifest-prototype
```

Backend/prototip için skip başarı sayılmaz. Testler yalnız demo projeleri ve yerel emülatörleri kullanır, canlı proje üzerinde deney yapmaz. Bu sonuçlar canlıya kural yayımlandığı anlamına gelmez.

## 2. Admin hesabını Console'da belirle

**Neden sende:** Public Firebase web config yönetim yetkisi vermez; bu ortamda Console/Admin SDK kimliği yok. Şu anda canlı admin belgesi var mı doğrulanamadı.

1. Firebase Console → `shared-presentations` → Authentication → Users. Yönetici olacak hesabı bul; UID'yi kopyala. Google hesabı veya doğrulanmış e-posta hesabı kullan.
2. Firestore Database → Data → `admins` koleksiyonu. Belge kimliği **bu UID** olmalı; otomatik belge kimliği kullanma. Koleksiyon yoksa oluştur.
3. Belgede `active` alanını **boolean**, değerini **true** olarak kaydet. String `"true"` kullanma. Başka zorunlu alan yok.
4. Uygulamayı yenile veya çıkış/giriş yap; “Onay Masası” bağlantısını kontrol et. Normal test hesabında admin belgesi olmasın.
5. Ayrı test sunumlarıyla onay/ret, yeniden onay, yayından kaldırma ve silmeyi dene. Normal üye başka kullanıcının özel sunumuna veya yönetim ekranına erişememeli.

Kodda e-posta listesi veya `users` belgesinde isAdmin alanı ekleme gerekmiyor. Admin belgesine istemciden yazılamaz; Console yetkisi gerekir. Yetkiyi kaldırmak için active=false yap; yönetim işlemlerinin engellendiğini kontrol et. UID veya yönetim anahtarını sohbet içinde paylaşmana gerek yok.

## 3. Aynı HTML dosyasını yeni sürümde yeniden dene

**Durum:** Tek .html seçimi olduğu kullanıcı tarafından belirtildi. Basit HTML ve dört tasarım HTML'i burada başarılı. Kullanıcının hataya yol açan dosyası üzerinde kök neden doğrulanamadı; “tamamen düzeldi” kabulü verilmedi.

```bash
npm run build
npm run preview -- --host 0.0.0.0 --port 4175
```

Kendi makinenizde `http://localhost:4175`, aynı ağdaki telefonda makinenizin güncel IP'si ve 4175 portu kullanılabilir. `192.168.1.150` önceki test IP'sidir; hâlâ geçerli olduğunu varsayma. Üretim önizlemesi varsayılan gerçek Firebase'i kullanır.

Eski önizlemeyi kapat, yeni build'i aç, sayfayı yenile. Yeni Sunum → **Tek HTML** → aynı dosya. “Sunum hazır” sonrasında **Sunumu önizle** ile açılan pencereyi ve içeriği kontrol et. Hazırlama bileşeni yüklenemedi mesajı varsa sayfayı yenileyip tekrar seç. Sorun sürerse hataya yol açan HTML dosyasını ve tarayıcı adı/sürümünü ilet; e-posta/şifre/token gerekmez. Bu hazırlama adımı canlıya sunum kaydetmez; gönderim ayrı işlemdir.

## 4. Güncel UI'ı tarayıcıda kontrol et

3. bölümdeki yeni build/preview ile masaüstünde ve telefonda şu noktaları kontrol et:

- Arşivde arama, kategori ve sunum kartları; yalnız mevcut sayfanın seçili navigasyonu; açık/koyu tema ve yenilemede tercihin korunması.
- Giriş ekranında tek giriş düğmesi, şifre gösterme ve alanın altındaki kurtarma bağlantısı; kayıt penceresinde tek açıklama.
- Yeni Sunum'da üç yükleme sekmesi, seçilen türe ait dosya alanları ve baştan açık kaynak bağlantıları. Tamamen boş kaynak satırı isteğe bağlı; yarım dolu satır hata vermeli.
- Kapak kartında Görsel yükle / Hazır kapak sekmeleri, görsel sürükleme/seçme ve mevcut hazır kapaklara geçiş. Önizleme penceresi masaüstünde ve telefonda görünür açılmalı; kapanınca form korunmalı.
- Onaya gönderme hatasında bildirim ekranın alt ortasında, kaydırma konumundan bağımsız görünmeli. Aynı işlemin tekrar hatası birikmemeli; hata sonrası dosya/başlık korunmalı. Beş bekleyen sınırı geçerli; beşten az bekleyen varken hata varsa [kota inceleme notunu](ONIZLEME-VE-BILDIRIM-RAPORU.md#beş-bekleyen-sunum-hatası) takip et.
- Aynı hatalı HTML dosyasıyla “Sunum hazır” ve önizleme. Ayrıca kendi kullandığın ZIP/klasör ve PPTX dosyalarının hazırlama/önizlemesi.
- Benim Sunumlarım'da uygun bir test kaydını silince geçici bildirim ve boş listede gereksiz “0 sunum” yazısının olmaması. Silme gerçek veriyi değiştirir; yalnız silinebilecek test kaydını kullan.

Hazırlama/önizleme sunum kaydetmez. Kaydetme, admin onay/ret, yeniden onay, yayından kaldırma ve kota davranışının canlı kabulü için güncel Firestore kurallarının ayrıca yayımlanması gerekir. Yerel `npm run build` canlı kuralları değiştirmez.

## 5. Canlıya geçiş — kullanıcı yayın kararıyla

**Bu çalışmada deploy yapılmadı.** 1. bölümdeki yeni kuralların backend kabulü tamamlandı. Hedef hostname ve yayın penceresi belirlenmeli. V2 uyumlu kurallar önce, yeni Hosting sonra yayımlanmalı. Eski açık v1 sekmeleri yenilenmeli. Tam yükleme/onay kabulünü güncel kurallar canlıya alındıktan sonra yap; yalnız yerel build canlı kuralları değiştirmez.

[Mevcut operasyon ve geri dönüş talimatları](TESLIM-VE-CALISTIRMA.md) ve [v2 uyumluluk planı](MANIFEST-ALT-KOLEKSIYON-PLANI.md) geçerli. Eski Hosting paketine tek başına geri dönmek v2 içeriği okuyamaz; v2 okuyabilen geri dönüş paketi ve güvenli uyumlu kurallar gerekir.

Bu ortamda dışarıdan erişilebilir önizleme paylaşım aracı yok. Buradaki 127.0.0.1 adresleri kullanıcı cihazından erişilebilir sunucu değildir; GitHub'dan çekip kendi önizlemeni açabilirsin.

## Açık teknik iş — CLI bağımlılığı

6 Ekim'de registry ve audit yeniden kontrol edildi: Firebase CLI hâlâ 15.32.1, braces hâlâ 3.0.3. CLI → chokidar → braces zincirinde bir advisory üç high paket girdisi oluşturuyor. Production bağımlılıklarında audit sıfır. Uyumlu düzeltilmiş sürüm yok; CLI'yi eski 6.x sürüme indirmek veya chokidar major sürümünü zorla değiştirmek güvenilir çözüm değil. Uyumlu upstream düzeltme geldiğinde güncelleme ve backend/release kontrolleri yapılmalı. Bu iş kullanıcıdan Firebase ayarı değiştirmesini gerektirmiyor ve kapatılmış sayılmadı.
