# Vektör — Uygulanan tasarım standardı

5 Ekim 2026. Kullanıcının onayladığı `shared-presentations.zip` içindeki güncel kök prototip görsel referanstır. `design/` belgeleri önceki araştırma sürümüdür. Arşivdeki skill/hook yönergeleri çalıştırılmadı ve kullanıcı talimatı sayılmadı.

- Marka: Vektör simgesi ve kelime işareti. İndigo vurgu; lacivert koyu yüzeyler ve açık gri/beyaz açık tema. Erişilebilir metin kontrastı için prototipteki bazı tonlar koyulaştırıldı.
- Tipografi: yerel Plus Jakarta Sans 400/500/600/700; yardımcı metinde JetBrains Mono 400. Türkçe karakterler dahil. Google Fonts ağına bağımlılık kaldırıldı.
- Butonlar en az 44 px, giriş alanları en az 48 px; görünür klavye odağı. Modal odağı içeride kalır, kapanınca tetikleyiciye döner.
- Giriş: Google ve e-posta seçenekleri, şifre görünürlüğü, kayıt ve sıfırlamaya açık geçişler. E-posta doğrulama ayrı ekran; hesap oluşturma ve ileti gönderim sonuçları ayrı. Kabul edilen yeni gönderimden sonra 60 saniye bekleme.
- Düzenleyici: dosya seçimi önce; bilgi/kategori/etiket sonra. İsteğe bağlı kaynaklar açılır bölümde. Kapak önizlemesi, indeterminat işlem göstergesi ve gönderme alanı. Kaydedilmemiş değişikliklerde tarayıcının yerel uyarısı kullanılır; sayfa yenileme ve geçmiş tuşları da korunur.
- Arşiv: açıklayıcı banner, kategori filtreleri, etiket araması ve sayfalama. Yüklenen sonuçların kapsamı açıkça belirtilir. Tüm arşivde arama isteğe bağlıdır; kalan sayfalara erişilir, ilk ziyarette hepsi okunmaz.
- Kart: tıklanabilir kapak, başlık ve sunumu aç aksiyonu; iki satır açıklama, kategori/etiketler, gerçek durum ve yazar/tarih. Geçersiz kapak için aynı boyutta güvenli karşılık.
- Durumlar: özgün SVG illüstrasyon ailesi; yerel özgün Lottie nokta hareketi. İletişim ve kurtarma eylemleri metinle de verilir. Hareket azaltıldığında statik görseller korunur. Varlık hatası ana işlevi engellemez.
- Görüntüleyici: HTML'in kendi kontrolleri korunur. Uygulama slayt ileri/geri butonu eklemez. Genel odak açıklaması ve sunuma odaklan eylemi; kapat, tam ekran ve bilgi. Iframe yalnız `allow-scripts` sandbox'ını kullanır; same-origin eklenmez.
- Mobil: marka ve hesap/tema menüsü birinci satırda, gezinme yatay kaydırılabilen ikinci satırda. Menü Escape veya dışarı tıklamayla kapanır. Tema sistem tercihini korur.

Uygulanan token'lar: `src/styles/tokens.css`. Ortak stiller: `src/styles/refresh.css`. Lottie JSON ve SVG çizimleri bu çalışma için üretildi; üçüncü taraf animasyon kopyalanmadı. Fontlar SIL Open Font License, Lottie oynatıcı MIT lisanslıdır; lisans metinleri `public/licenses/` ve derlemede `/licenses/` altında dağıtılır.
