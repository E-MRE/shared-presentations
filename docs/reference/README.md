# Prototype reference (AI Studio, 2026-10-02)

Screenshots of the working prototype at https://shared-presentations.ai.studio/ (logged in as admin, single light theme, desktop ~1512px).
Purpose: functional reference for the rebuild. The visual design comes from the design system (`design-system/` files), NOT from these screenshots.
Admin e-mail masked as admin@example.com.

## Routes
| Route | Screen | File |
|---|---|---|
| `/` | Keşfet: approved decks as cards (cover or generated placeholder, PPTX badge, title, subtitle, date, author, "Sunumu Aç") | 01 |
| `/benim` | Sunumlarım: own decks list with status (Yayında / Reddedildi + "Yönetici Red Notu"), type badge, date, size; Önizle / Düzenle / delete; pending quota "0/5" | 02 |
| `/admin` | Yönetici Paneli, tabs Bekleyenler / Yayındakiler (n) / Reddedilenler (n). Published: PPTX "İndirip İncele", HTML "Önizle", "Yayından Kaldır", delete. Rejected: red note, "Yine de Onayla" | 03–05 |
| `/yeni` | Yeni Sunum Ekle (full page, not modal) | 06–09 |
| `/duzenle/:id` | Sunumu Düzenle (same form, file type fixed, "Değişiklikleri Kaydet") | 14 |
| `/s/:id` (HTML) | Viewer: top bar Geri, HTML badge, title, Bilgi, Tam Ekran; deck in iframe; Bilgi = side panel (uploader, date, original size, chunk count, description, resource links) | 10–11 |
| `/s/:id` (PPTX) | Detail page: Tüm Sunumlar, Bağlantıyı Paylaş, type badge, date, size, title, subtitle, large cover/placeholder, owner, "PPTX'i İndir (size)", antivirus warning, description card | 12–13 |

## Upload form fields and limits (from page text)
- Başlık * (max 200), Alt başlık (max 300), Açıklama metni (max 5000).
- Kapak görseli: JPG/PNG/WebP, resized in browser to 640 px width, compressed under ~100 KB; without it a placeholder is generated from the title.
- Sunum dosyası * with three modes:
  - HTML (Klasör / Zip): CSS/JS/images/fonts inlined into index.html as one piece. Entry index.html, max 300 files, unpacked max 25 MB, after compression max 5 MB.
  - Tek .html: self-contained HTML file (same limit text shown).
  - PowerPoint (.pptx): max 8 MB, PK header check, max 12 chunks, no zip; stored raw.
- Kaynak bağlantıları: max 10, label + URL.
- Buttons: Vazgeç, Onaya Gönder (disabled until valid).

## Added from user (2026-10-02)
| Screen | File |
|---|---|
| Admin pending item: cover thumb, author, date, size, chunks, subtitle, quoted description; Önizle / Onayla / Reddet / delete; amber counter on Admin nav + Bekleyenler tab | 15 |
| Logged out home: only Keşfet + "Google ile Giriş Yap" | 16 |
| Login modal "Ekip Portalı Girişi": admin quick-login card + "Başka bir ekip üyesi / Google e-postası ile giriş yap" | 17 |
| Login modal with free e-mail + optional name fields, "Oturum Aç" | 18 |

**Rebuild warning:** the prototype login (17–18) is an AI Studio sandbox workaround ("GCP IAM kısıtlaması") where the user types an e-mail. Do NOT copy it: the rebuild must use real authentication (e.g. Google OAuth) and decide admin role server-side, never from a typed e-mail.

## Not captured
- Mobile width (window resize was not applied).
