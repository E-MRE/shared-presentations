# Kullanıcı ve ortam bağımlılıkları — 6 Ekim 2026

UI düzeltmeleri için başka tasarım kararı gerekmiyor. Bu dosya önceki bağımlılık listesinin güncel karşılığıdır; tarihsel test sonuçları SON-KONTROL-RAPORU.md ve Git geçmişinde korunuyor.

Gerçek doğrulama e-postası, şifre sıfırlama/yeni şifre, Google hesap seçimi/iptal/giriş, 60 saniyelik yeniden gönderme ve fiziksel telefonda giriş kullanıcı tarafından önceki sürümde test edildi. Bunlar yeniden bekleyen iş olarak listelenmiyor. Firebase bağlı; Firestore ve e-posta/Google sağlayıcıları etkin. Test sunumu için içerik koruma bağımlılığı yok.

## 1. Yeni kuralları emülatörde doğrula — yayın öncesi gerekli

**Neden sende:** Bu çalışma ortamı Firestore JAR indirmesinin `storage.googleapis.com` hedefine erişemiyor. Yeni kota/bağlantı kuralları burada gerçek emülatörde çalıştırılamadı. Önceki 160/160 backend sonucu eski `ee4f5c0` kuralları içindir; yeni kuralları kanıtlamaz.

Node 24 LTS ve Java 21 bulunan, indirme erişimi olan ortamda depoyu güncelle:

```bash
git pull --ff-only
node --version
java --version
npm ci
npm run test:backend
npm run test:manifest-prototype
```

Her komut başarılı çıkmalı; backend/prototip için skip olmamalı. Kota geçişlerinin olumlu senaryoları, yeni bağımsız sayaç azaltma retleri, Unicode boş bağlantı etiketi retleri ve 12 parça + 8 etiket + 10 bağlantı sınırı birlikte doğrulanmalı. Çıktıyı dosyaya kaydet; başarısız senaryo adını ve hassas olmayan hata metnini ilet. Testler yalnız `demo-shared-presentations` ve yerel emülatörleri kullanır, canlı proje üzerinde deney yapmaz.

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

Eski önizlemeyi kapat, yeni build'i aç, sayfayı yenile. Yeni Sunum → **Tek HTML** → aynı dosya. “Sunum hazır” ve önizlemeyi kontrol et. Hazırlama bileşeni yüklenemedi mesajı varsa sayfayı yenileyip tekrar seç. Sorun sürerse hataya yol açan HTML dosyasını ve tarayıcı adı/sürümünü ilet; e-posta/şifre/token gerekmez. Bu hazırlama adımı canlıya sunum kaydetmez; gönderim ayrı işlemdir.

## 4. Canlıya geçiş — kullanıcı yayın kararıyla

**Bu çalışmada deploy yapılmadı.** Önce 1. bölümdeki yeni kuralların testleri geçmeli. Ardından hedef hostname ve yayın penceresi belirlenmeli. V2 uyumlu kurallar önce, yeni Hosting sonra yayımlanmalı. Eski açık v1 sekmeleri yenilenmeli. Tam yükleme/onay kabulünü güncel kurallar canlıya alındıktan sonra yap; yalnız yerel build canlı kuralları değiştirmez.

[Mevcut operasyon ve geri dönüş talimatları](TESLIM-VE-CALISTIRMA.md) ve [v2 uyumluluk planı](MANIFEST-ALT-KOLEKSIYON-PLANI.md) geçerli. Eski Hosting paketine tek başına geri dönmek v2 içeriği okuyamaz; v2 okuyabilen geri dönüş paketi ve güvenli uyumlu kurallar gerekir.

Bu ortamda dışarıdan erişilebilir önizleme paylaşım aracı yok. Buradaki 127.0.0.1 adresleri kullanıcı cihazından erişilebilir sunucu değildir; GitHub'dan çekip kendi önizlemeni açabilirsin.

## Açık teknik iş — CLI bağımlılığı

Firebase CLI 15.32.1 → chokidar → braces 3.0.3 zincirinde bir advisory üç high paket girdisi oluşturuyor. Production bağımlılıklarında audit sıfır. Registry'de uyumlu düzeltilmiş sürüm yok; CLI'yi eski 6.x sürüme indirmek veya chokidar major sürümünü zorla değiştirmek güvenilir çözüm değil. Uyumlu upstream düzeltme geldiğinde güncelleme ve backend/release kontrolleri yapılmalı. Bu iş kullanıcıdan Firebase ayarı değiştirmesini gerektirmiyor ve kapatılmış sayılmadı.
