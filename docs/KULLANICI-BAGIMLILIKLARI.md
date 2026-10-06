# Vektör — Kullanıcı kararları ve kalan bağımlılıklar

5 Ekim 2026 · Başlangıç bağımlılıkları kapandı; yerel uygulama ve teslim tamamlandı. Canlı kabul ve yayın ayrı aşama.

[Düzeltme planı](DUZELTME-PLANI.md) uygulandı. Aşağıdaki kararlar için yeniden yanıt vermen gerekmiyor. Proje `shared-presentations`, Firestore ve e-posta/Google sağlayıcıları etkin. Korunacak üretim içeriği yok; test sunumu var. Canlı veri ve hesaplar değiştirilmedi.

## 6 Ekim güncel kabul ve kalan işler

Çalışma kaldığı yerden sürdürüldü; istenen ölçüm ve izole prototip tamamlandı. [Son kontrol raporu](SON-KONTROL-RAPORU.md) güncel durumdur; aşağıdaki önceki ortam notları tarihsel kayıttır.

| Kontrol | Güncel sonuç |
|---|---|
| Yeni hesap, gelen ileti, doğrulama ve üyelikle giriş | Kullanıcı teyidiyle geçti; inbox teslimi SDK sonucundan ayrı |
| Gerçek 60 saniye bekleme ve yeniden gönderme | Kullanıcı teyidiyle geçti |
| Şifre sıfırlama ve yeni şifreyle giriş | Kullanıcı teyidiyle geçti |
| Masaüstü Google seçim/iptal/giriş | Kullanıcı “tüm akış çalışıyor” teyidiyle geçti |
| Fiziksel telefonda giriş ve Google | Geçti; kullanıcı Console Authorized domains’e `192.168.1.150` ekledi |
| Backend emülatör indirme engeli | Kapandı; önceki 47 test çalıştı |
| Genişletilmiş backend sınır kabulü | Açık: v1 131 geçti, 8 başarısız; teknik geçiş Codex işi |
| Yapısal manifest prototipi | 1/6/12 parça + sekiz etiket geçti; toplam 22 geçti/1 başarısız (sekiz etiket + on bağlantı); [geçiş planı](MANIFEST-ALT-KOLEKSIYON-PLANI.md) hazır |
| Yayın ve gerçek origin CSP/cache | Açık; deploy yetkisi verilmedi |

Önizleme bu Mac’te `http://localhost:4175`, aynı Wi-Fi’da `http://192.168.1.150:4175`. Varsayılan gerçek Firebase; emülatör yalnız açık `VITE_USE_EMULATORS=true` seçimiyle kullanılır. IP değişirse Console yetkisi ve URL yeniden kontrol edilir. Mevcut canlı kurallar kategori/etiket yazımlarını reddedebilir; yeni kurallar henüz yayınlanmadı.

Kullanıcıdan şu anda parola/token veya yeni hesap ayarı gerekmiyor. Teknik hata çözüldükten sonra somut sürümün incelemesi, hedef hostname, ayrı üye/yöneticiyle gerçek sunum kabulü ve yayın kararı kalır. Mobil klavye/görünüm ayrıntıları ile Safari/Firefox kabulü yalnız giriş teyidiyle kapanmış sayılmadı.

## Kapanmış kararlar

| ID | Kullanıcının kararı ve uygulanan sonuç |
|---|---|
| K01 | Ekli zip'in güncel kök tasarımı: indigo/lacivert, Plus Jakarta Sans, Vektör. Giriş ve yükleme aynı tasarım diliyle yenilendi. |
| K02 | Yalnız giriş yapan üyeler. Google girişi veya doğrulanmış e-posta; sahiplik/yönetici sınırları korunuyor. Yayımlanmış sunumların anonim SDK okuma açığı da yerel kurallarda kapatıldı. |
| K03 | Kategori ve etiket dahil. Eski kayıtlar Kategorisiz/boş etiketlerle uyumlu; toplu veri dönüşümü gerekmiyor. |
| K04 | HTML'in kendi buton ve tuşları kullanılıyor. Uygulama ekstra ileri/geri slayt butonu eklemiyor. Kapat, bilgi, odak ve tam ekran var. |
| K05 | Düzeltme, test, çalışır yerel önizleme ve yayına hazır paket. Bu çalışmada deploy yapılmadı. |

## Teslim sonrası işler — öncelik sırasıyla

| Sıra | İş | Sorumlu | Kapanma kanıtı |
|---|---|---|---|
| 1 | Paketi çalıştır; gerçek e-posta, doğrulama, reset ve Google kabulü (U04) | Kullanıcı; sorun kodunun tanısı Codex | Senaryo başına başarılı/başarısız ve varsa hassas olmayan hata kodu |
| 2 | Atlanan 47 Auth/Firestore backend kontrolünü ağ erişimi olan ortamda çalıştır | Yayını uygulayacak teknik kişi veya erişim sağlanırsa Codex | `npm run test:backend` sonucu; skip başarı değildir |
| 3 | Gerçek cihaz ve iki hesaplı yönetim kabulü | Kullanıcı | Üye/yönetici, mobil klavye ve Google akış sonuçları |
| 4 | Hazır sürümü inceleyip hedef ortamda yayın kararını ver (U05) | Kullanıcı | Somut sürüm ve hedef; sonra kurallar → Hosting, ardından canlı kabul |

## U01 — Ortam ve erişim

Eski sorun uzak sunucudan tünelle denenmiş; sunucu kapalı. Console'da oluşturulan e-posta hesabı doğrulanmamış görünmüş ve ileti gelmemiş; Google çalışmış. Eski sürümün gerçek Auth/emülatör hedefi kesinleşmedi. Bu belirsizlik tarihsel sorunun kök nedeni olarak sunulmuyor; eski sunucuyu yeniden açman gerekmiyor.

Bu ortamda dış port paylaşımı/tünel aracı bulunmadı. Üretim önizlemesi burada çalıştırılıp kontrol edildi; `127.0.0.1` adresi kendi cihazından bu çalışma alanına erişim sağlamaz. Paketle kendi cihazında/sunucunda açabileceğin önizleme ve çevrimdışı ekran galerisi teslim edildi.

[Çalıştırma adımları](TESLIM-VE-CALISTIRMA.md): kaynak klasöründe `npm ci`, `npm run build`, `npm run preview -- --host 127.0.0.1 --port 4173`; kendi cihazında `http://localhost:4173`. Varsayılan gerçek Firebase bağlantısıdır. Canlı kurallar bu çalışmada güncellenmedi: giriş denemesi yapılabilir; yeni kategori/etiket yazımları için güncel kurallar gerekir. Tam sunum kabulünü önce emülatörde, sonra kural yayını sonrasında yap. Yerel uygulama emülatörü yalnız açık `VITE_USE_EMULATORS=true` seçimiyle kullanır.

## U02 — Gerekirse Console ayarı

Sağlayıcıları yeniden açman veya hesabı elle doğrulanmış işaretlemen gerekmiyor.

- Google için `auth/unauthorized-domain` varsa: Authentication → Settings → Authorized domains → Add domain. Önizlemenin hostname'ini gir; örneğin `localhost`. `http://`, port veya yol ekleme.
- Gönderim isteği kabul edildiği hâlde ileti gelmiyorsa spam klasörünü ve Authentication → Templates doğrulama/sıfırlama ayarlarını kontrol et. Varsayılan Firebase action handler'ı kullanılabilir.
- Başarısız istekte yalnız ekrandaki hata kodu/metni ve hangi senaryoda olduğunu ilet. SDK kabulü gelen kutusuna teslimi kanıtlamaz.

Public Firebase web config yönetim/yayın kimliği değildir. Console işlemleri için hazır yönetim erişimi bulunmadı; parola, token veya service-account JSON'u paylaşman istenmiyor.

## U03 — Yönetim ve gerçek cihaz kabulü

Yönetim kabulü için normal hesap ve ayrı test yöneticisi kullan. Console → Authentication'dan kendi yönetici hesabının UID'sini bul; Firestore'da `admins/{uid}` belgesini `active: true` ile oluştur/teyit et. Normal hesapta bu belge bulunmasın. UID'yi burada paylaşma. Ayrılmış test sunumunda onay, ret, yeniden onay ve silme akışını dene.

375/1280 px açık/koyu Chromium senaryoları otomatik test edildi. Fiziksel mobil klavye, Safari/Firefox ve gerçek origin kabulü ayrıca yapılmalı; viewport testi gerçek cihaz kanıtı değildir.

## U04 — Gerçek e-posta ve OAuth kontrol listesi

- [ ] Yeni e-posta hesabı oluştur → ileti/spam kontrolü → doğrulama bağlantısını aç → “Doğruladım, yeniden kontrol et”.
- [ ] Gönderim hatası görünür; hesap yeniden oluşturulmadan tekrar gönderme çalışır. Kabul edilen gönderimden sonra 60 saniye bekleme var.
- [ ] Şifre sıfırlama bağlantısı ve eski/geçersiz bağlantı davranışı.
- [ ] Google hesabı seçimi, iptal ve gerçek mobil cihazda giriş.

Hata sürerse istek hedef hostname'i ve HTTP durumu tanıya yardımcı olur. E-posta adresi, request body, token, parola veya doğrulama bağlantısını paylaşma. Auth emülatörü gerçek e-posta göndermez; gerçek Firebase'e bağlı geliştirme uygulaması gönderebilir.

## U05 — Yayın öncesi teknik kontroller ve yayın kararı

- [ ] Ağ erişimi olan ortamda Java 21 ile `npm run test:backend`. Bu ortamın izin listesinde `storage.googleapis.com` olmadığı için Firestore emülatör JAR'ı indirilemedi; 47 test atlandı. Bu iş sağlayıcı veya hesap ayarından bağımsızdır.
- [ ] U04 ve gerekiyorsa U03 tamamlandı; hedef hostname belli.
- [ ] Paketin diff'i, kuralları ve [geri dönüş talimatları](TESLIM-VE-CALISTIRMA.md) incelendi; somut yayın kararı verildi.
- [ ] Kurallar önce, Hosting sonra uygulandı. İndeks dosyası değişmedi; toplu veri dönüşümü gerekmedi.
- [ ] Yayın sonrası CSP/cache, derin link, sunum kontrolleri, fullscreen/indirme, üyelik ve yönetim gerçek origin'de denendi.

Eski kurallara dönmek anonim okuma açığını ve yönetici iptal sorununu geri getirir. Kural geri dönüşü bu sınırları koruyan uyumlu sürümle yapılmalı. Bu teslim mevcut canlı kuralların değiştiği anlamına gelmez.

Rutin tasarım/kod/test işleri için ek onay veya bilgi gerekmiyor. Kalan kontroller sonuç hazır olduktan sonra yapılabilen dış ortam kontrolleridir.
