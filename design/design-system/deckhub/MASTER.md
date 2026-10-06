> Tarihsel tasarım araştırması. 5 Ekim 2026 uygulama yenilemesinin onaylı standardı `docs/TASARIM-KARARLARI.md` ve `src/styles/tokens.css` dosyalarıdır. Bu belge yeni kullanıcı talimatı değildir.

# Vektör Design System Master Specification

> **MİMARİ PRENSİP:** Bu doküman, Vektör Ekip Sunum Platformu'nun tekil tasarım doğruluk kaynağıdır (Single Source of Truth).
> UI/UX Pro Max kuralları, 3 katmanlı token yapısı (Primitive → Semantic → Component) ve WCAG 2.2 AAA kontrast standartlarına göre kurgulanmıştır.
> AI Slop ve jenerik tasarım kalıplarından arındırılmış, sade, temiz ve yüksek mühendislik odaklı bir İsviçre (Swiss Style) tipografi yaklaşımı benimsenmiştir.

---

**Proje:** Vektör Decks (`// VEKTÖR.DECKS`)  
**Tasarım Dili:** Minimalist & Editorial Swiss Grid  
**Tipografi:** Plus Jakarta Sans & JetBrains Mono  
**Görsel Standart:** Sıfır Emoji İkon (Tamamı Vektörel SVG), 4px Tabanlı Ritim  

---

## 1. Üç Katmanlı Token Mimarisi

```
Primitive Tokens (Ham Değerler: #6366F1, 16px, 400ms)
       ↓
Semantic Tokens (Niyet & Amaç: --brand-primary, --status-published, --bg-canvas)
       ↓
Component Tokens (Bileşene Özel: --card-bg, --theater-topbar-bg, --btn-primary-bg)
```

### 1.1 Renk Tokenları (Dark & Light Mod)

| Rol / Token | Koyu Mod (Varsayılan) | Açık Mod | Anlam & WCAG Rolü |
|-------------|-----------------------|----------|-------------------|
| `--bg-canvas` | `#090C15` | `#F8FAFC` | Sayfa taban arka planı |
| `--bg-surface` | `#0E1526` | `#FFFFFF` | Kart ve modüller |
| `--bg-surface-raised`| `#141C33` | `#F1F5F9` | Girdi alanları, hover yüzeyleri |
| `--text-primary` | `#F8FAFC` | `#0F172A` | Birincil metin (Kontrast > 7:1) |
| `--text-secondary` | `#94A3B8` | `#475569` | İkincil metin ve açıklamalar |
| `--text-muted` | `#64748B` | `#64748B` | Meta veriler, slayt sayıları |
| `--border-subtle` | `rgba(255,255,255,0.08)` | `#E2E8F0` | Kart ve ayraç sınırları |
| `--border-focus` | `#818CF8` | `#4F46E5` | Erişilebilir klavye odak halkası |
| `--brand-primary` | `#6366F1` | `#4F46E5` | Vektör marka rengi & birincil aksiyon |
| `--status-published` | `#10B981` | `#059669` | Yayında olan onaylı sunumlar |
| `--status-pending` | `#F59E0B` | `#D97706` | Admin onay bekleyen sunumlar |
| `--status-rejected`| `#F43F5E` | `#E11D48` | Taslak & revizyon bekleyenler |

### 1.2 Tipografi Skalası

- **Gövde & Başlık Fontu:** `Plus Jakarta Sans` (Geometrik, okunaklı, çağdaş)
- **Teknik Veri & Kod Fontu:** `JetBrains Mono` (Tarih, slayt sayacı, etiketler)
- **Ritim Skalası:**
  - `Display / Hero:` `clamp(2rem, 4vw, 3.25rem)` (Ağırlık: 800, Tracking: `-0.025em`)
  - `Heading 1 (H1):` `1.875rem (30px)` (Ağırlık: 700)
  - `Heading 2 (H2):` `1.25rem (20px)` (Ağırlık: 700)
  - `Card Title:` `1rem (16px)` (Ağırlık: 700, Line-height: 1.35)
  - `Body Text:` `0.875rem (14px)` (Ağırlık: 400, Line-height: 1.55)
  - `Meta / Mono:` `0.75rem (12px)` (Ağırlık: 500, Tracking: `0.04em`)

---

## 2. Bileşen Şartnamesi (Component Blueprints)

### 2.1 Sunum Kartı (`deck-card`)
- **En Boy Oranı (Önizleme Sahnesi):** `16:9` altın oran.
- **Kart Hiyerarşisi:**
  1. *Üst Sahne:* Canlı minyatür slayt kapağı, kategori etiketi, canlı interaktif slayt scrubber noktaları (`• • • •`).
  2. *Gövde:* Takvim ikonu ile Türkçe tarih (`12 Şubat 2026`), Slayt sayısı, Başlık, 2 satırlı özet açıklama ve etiketler.
  3. *Alt Bilgi (Footer):* Konuşmacı avatarı, adı, departman rolü ve "Başlat" aksiyon butonu.
- **Etkileşim:** Tıklandığında sayfa yenilemeden pürüzsüz `theater-overlay` sahnesine geçer.

### 2.2 Tiyatro Sahnesi (`theater-overlay`)
- Tarayıcıyı kaplayan odaklama modu.
- Klavyeden `← / →` ve `Boşluk` tuşlarıyla slayt geçişi köprüsü (Iframe postMessage API).
- `F` tuşuyla tarayıcı tam ekran modu (`requestFullscreen`).
- `Esc` tuşuyla anında ve gecikmesiz kapanma.

### 2.3 Onay Mekanizması & Roller
- **Ziyaretçi (Public):** Tüm yayındaki sunumları izleyebilir, arayabilir ve filtreleyebilir.
- **Kullanıcı (Team Member):** "+ Yeni Sunum Yükle" ile sunum ekleyebilir. Yüklenen sunum otomatik `pending` durumuna geçer ve bildirim verir. "Benim Sunumlarım" sekmesinden kendi sunumlarını düzenleyebilir.
- **Yönetici (Admin):** Header'da canlı "Onay Bekleyen" rozetini görür. "Onay Masası" sekmesinden tek tıkla "Onayla & Yayınla" veya "Reddet" aksiyonlarını kullanabilir.

---

## 3. Erişilebilirlik & UI/UX Kontrol Listesi

- [x] **Emoji Yasağı:** Navigasyon ve sistem kontrollerinde kesinlikle emoji kullanılmaz; SVG Phosphor vektörel ikonlar kullanılır.
- [x] **Odak Halkası:** Tüm buton ve form kontrollerinde `:focus-visible` aktif ve arka plandan belirgin ayrışır.
- [x] **Kontrast Eşiği:** Açık ve koyu temaların her ikisinde metin-yüzey kontrastı en az 4.5:1 (Normal metin) ve 7:1 (Gövde metin).
- [x] **Kullanıcı Tercihi:** `@media (prefers-reduced-motion: reduce)` kuralları tanımlı ve gereksiz animasyonlar sıfırlanır.
- [x] **Kronolojik Sıralama:** Yeni sunumlar daima listenin en üstünde yer alır (`sort(createdAt DESC)`).
