# Manifest alt koleksiyon prototipi — 6 Ekim 2026

**V2 ürün geçişi yerelde tamamlandı. Tam backend 160/160, sıfır skip; 12 parça + sekiz etiket + on bağlantı gerçek servisle geçti. Push/deploy yok.** Aşağıda önceki başarısız ölçümler tarihsel kanıt olarak korunuyor; güncel durum bu giriş ve uygulama sonucu bölümüdür.

## Önce ölçüm

Başarısız 12 parça / sekiz etiket transaction’ından sonra şu rapor gerçekten tarayıcıda açıldı:

`http://127.0.0.1:8080/emulator/v1/projects/demo-shared-presentations:ruleCoverage.html`

Kaydedilen dosyalar: `test-results/son-kontrol/coverage-12-chunks/{coverage.html,coverage.json,coverage.png,vitest.json,trial.json}`. Bu tanı çalışması yalnız ilgili testi seçti: 1 başarısız, 19 seçilmemiş test; backend kabulü sayılmadı. Ölçülen başarısız kural sürümünün SHA-256 değeri [fonksiyon özetinde](kanit/son-kontrol-2026-10-06/coverage-12-chunks-summary.json).

| Fonksiyon | Kaydedilen değerlendirme |
|---|---:|
| `areValidManifestEntries` | 288 |
| `validateManifest` | 40 |
| `sumChunkSizes` | 0 — bu başarısız denemede ulaşılmadı |
| `isValidTag` | 144 |
| `areValidTags` | 150 |
| `validateDeckFields` | 216 |
| `isValidLink` / `areValidLinks` / `isHttpsUrl` | 32 / 104 / 18 |
| `checkUserQuotaOnDeckCreate` | 110 |
| `canWriteChunk` | 3456 |
| `canCreateDeck` / `canUpdateDeck` | 210 / 174 |

Sayılar başarısız transaction boyunca kaydedilen AST değerlendirmeleridir; **tek yazımın kesin kota maliyeti değildir**. Helper gövdeleri ayrı sayılır; hiç çalışmamış dalların boş değer işaretleri çıkarılır. Örneğin `canWriteChunk` birden çok parça ve değerlendirme aşamasında çağrılır. Hatalı/undefined sonuçlar kayıtta tutulur, özet bunların sayısını ayrıca verir. Coverage bir tamamlama maliyeti veya tam bir per-request profiler sunmaz. İlgili fonksiyonun sıfır görünmesi ucuz olduğu anlamına gelmez.

Tekrarlanabilir özet komutu:

```sh
node scripts/summarize-rule-coverage.mjs \
  test-results/son-kontrol/coverage-12-chunks/coverage.json \
  test-results/son-kontrol/coverage-12-chunks/summary.json
```

Bu oturumdaki başarısız mikro değişiklikler, oturum başındaki çalışma kopyasına geri alındı (Git blob `fa0d43431c192ee2bcc0982deb40cde7457628d0`). Önceki profil oluşturma ve HTML limit düzeltmeleri korunuyor. Referans commit’ten kuralları yeniden kurma işlemi uygulanmadı.

## İlk izole prototip ve sonuç — tarihsel

Parça verisi zaten `presentations/{id}/chunks/{i}` içindeydi. Prototip ana belgedeki ikinci `chunks: [{index,size},…]` dizisini kaldırır; `chunkCount`, `sizes.encoded`, `manifestVersion: 2` kalır. Her parça `index`, `size`, `data` taşır. Kurallar yalnız o parçanın alanlarını, bayt boyunu, sahibini ve ana belgenin transaction sonrası durumunu doğrular.

Sadece her parçayı 900 KB ile sınırlamak eski toplam boyut bağını kaybettirirdi. Prototip bunu deterministik bölümleme ile korur:

```text
base = floor(sizes.encoded / chunkCount)
remainder = sizes.encoded % chunkCount
expectedSize(i) = base + (i < remainder ? 1 : 0)
```

`sizes.encoded >= chunkCount` ve `sizes.encoded <= 900000 * chunkCount`; parça verisinin bayt boyu ve `size` alanı tam `expectedSize(i)` olmalıdır. Böylece mevcut tüm parçalar doğru boyuttaysa toplamları tam beyan edilen boyuttur. İkili içerik sırası ve gzip/PPTX içeriği değişmez, yalnız bölme sınırları değişir. Eksik parça varlığı ayrıca okuma/birleştirmede hata üretmelidir; tek bir ana belge yazımı bütün çocuk belgelerin varlığını kendiliğinden kanıtlamaz.

Deney uygulama servisinin yerine gerçek SDK `runTransaction` kullanır: kullanıcı kotası okunur, ana belge + bütün çocuklar + kota tek transaction’da yazılır. Onay ve kota düşümü de tek transaction’dır. `firebase.json` hâlâ `firestore.rules` kullanır; test fixture’ları deploy yapılandırmasına bağlı değildir.

```sh
PATH=/private/tmp/vektor-node24/bin:/private/tmp/vektor-java21/Contents/Home/bin:$PATH \
JAVA_HOME=/private/tmp/vektor-java21/Contents/Home \
FIREBASE_EMULATORS_PATH=/private/tmp/vektor-firebase-emulators \
EVIDENCE_DIR=test-results/son-kontrol/manifest-v2-prototype-measured \
npm run test:manifest-prototype
```

| Senaryo | Sonuç |
|---|---|
| 1, 6, 12 parça + 8 etiket + 1 bağlantı | Üçü de geçti; oluşturma, tam bayt toplamı, kota 0→1, onay, kota 1→0 |
| Azami 5 MiB HTML / 8 MiB PPTX + 8 etiket + 150 KB kapak | İkisi de geçti; oluşturma ve onay |
| Yayımlanmış ana belge/parçaya anonim ve doğrulanmamış erişim | Reddedildi; doğrulanmış farklı üye okuyabildi |
| Yanlış parça boyu, index, veri boyu, ekstra alan, eksik kota | Reddedildi; transaction bütünü geri alındı |
| Geçersiz count, toplam/parça limiti, HTML beyanı, etiket sayısı, eski manifest dizisi/sürümü | Reddedildi |
| Başkasının adına oluşturma | Reddedildi |
| 12 parça + 8 etiket + 10 bağlantı | **Başarısız: ana belge hâlâ 1000 ifade limitine ulaşıyor** |

Ana prototip 20 geçti / 1 başarısız; ayrı bütçe kontrolü 2 geçti. Toplam **22 geçti, 1 başarısız, 0 skip**. Komut bilinçli olarak exit 1 verir; başarısız sınır testi gizlenmedi. [Kalıcı test özeti](kanit/son-kontrol-2026-10-06/manifest-prototype.json); ham sonuç `test-results/son-kontrol/manifest-v2-prototype-measured/vitest.json`.

İlk sentetik kontrol aşırı derin tek ifade yüzünden derlenmedi; 23 skip başarı sayılmadı. Derinlik düzeltildikten sonra büyük ikili örneklerin toplu coverage çıktısı HTTP 429 verdi. Bu yüzden yalnız bütçe kontrolünü ayrı **demo** proje ile ölçtüm; kabul testleri azaltılmadı. Bu iki tanı hatası ham loglarda duruyor.

## 1000 ifade bütçesinin kapsamı

`demo-shared-presentations-budget` projesindeki ayrı fixture, belge başına 50 farklı aralık kontrolü yapar. **12 belge tek `runTransaction` içinde geçti.** Yalnız bu başarılı transaction’a ait `budgetSegment` gövdesi coverage’da **8448** AST değerlendirmesi kaydetti. Başarısız kontrol ayrı helper kullanır; bu sayıya dahil değildir. Aynı tür kontrolleri tek belgede dört defa çalıştıran negatif kontrol gerçek “maximum of 1000 expressions” hatasıyla reddedildi.

Bu deney Firestore emülatörü v1.22.0’da işlem/belge başına ayrı ifade bütçesi olduğunu gösterir; bütün transaction için paylaşılan tek 1000 bütçesi varsayımını çürütür. [Bütçe coverage özeti](kanit/son-kontrol-2026-10-06/budget-scope-summary.json) ve HTML/JSON ham raporları `test-results/son-kontrol/manifest-v2-prototype-measured/` altında. Üretimde bir yük deneyi yapılmadı.

[Firebase belge sınırları](https://firebase.google.com/docs/firestore/security/rules-structure#security_rule_limits) 1000 ifadeyi request başına diye adlandırıyor; transaction’daki işlem ayrımının burada kanıtı emülatör deneyidir. Ayrıca belge erişimi için her işlemde 10, transaction toplamında 20 çağrı limiti vardır; cache’e alınmış çağrılar sayılmaz. Parça sayısını artırmak tüm diğer limitleri ortadan kaldırmaz. [Firestore API istek boyutu](https://firebase.google.com/docs/firestore/quotas#writes_and_transactions) da 10 MiB ile sınırlıdır.

## Sekiz backend hatasının sınıflandırılması

[Önceki backend özeti](kanit/son-kontrol-2026-10-06/backend-v1-baseline.json), commit `76f497c` durumunu korur. Sekiz testin her birinin ilk başarısız mesajında **maximum of 1000 expressions** var.

| Test adı | İlk hata | Şimdiki sonuç |
|---|---|---|
| `accepts 2 chunks with 8 tags` | v1 ifade limiti | Geçti |
| `accepts 6 chunks with 8 tags` | v1 ifade limiti | Geçti |
| `accepts 10 chunks with 8 tags` | v1 ifade limiti | Geçti |
| `accepts 12 chunks with 8 tags` | v1 ifade limiti | Geçti |
| `accepts 12 chunks with 0 tags` | v1 ifade limiti | Geçti |
| `creates and approves html at encoded, cover and catalog limits` | v1 ifade limiti, oluşturma aşaması | Geçti |
| `creates and approves pptx at encoded, cover and catalog limits` | v1 ifade limiti, oluşturma aşaması | Geçti |
| `catalog maximum tags validates atomic create and owner update` | v1 ifade limiti | Geçti |

Oluşturma engeli kalkınca iki azami boyut testinde mevcut olmayan `approveDeck()` çağrısı ortaya çıktı. Servisin mevcut `reviewDeck({ id, action: 'approve' })` API’siyle düzeltildi; yeni regresyon testindeki aynı yanlış çağrı da düzeltildi. Dolayısıyla ilk sekiz hatanın tamamı ifade limitiydi, fakat iki testte daha sonra görülen ayrı bir test altyapısı hatası da vardı.

## Ana belge maliyeti — regex öncesi/sonrası

Gerçek count=12, tags=8, links=10 örneğiyle her doğrulayıcı ayrı demo projede çağrıldı. Her bağımsız istekte aynı validator iki kez değerlendirildi; kayıtlar bu iki gözlenen çağrıya bölündü. [Karşılaştırma ve fonksiyon özetleri](kanit/son-kontrol-2026-10-06/parent-validator-comparison.json).

| Doğrulayıcı | Önce / çağrı | Tek regex + size sınırı sonrası / çağrı |
|---|---:|---:|
| 8 etiket (`isValidTag` + `areValidTags`) | 200 | 120 |
| 10 bağlantı (`isValidLink` + `isHttpsUrl` + `areValidLinks`) | 389 | 309 |
| Diğer alanlar, kategori, boyutlar ve v2 toplam bağı | 208 | 208 |

Bunlar **coverage AST sayaçlarıdır, motorun resmi 1000 kota sayacı değildir**. Permissions, quota ve değerlendirme dalları ayrı maliyet getirir; tablo toplamının 1000 altında görünmesi bütün yazımın geçeceği anlamına gelmez. Ham HTML/JSON ve Vitest sonuçları `test-results/son-kontrol/parent-before-regex/` ve `parent-after-regex/` altında.

Etiket için tek `matches('.*[^ ].*')` + `size() <= 32`; bağlantı etiketi için `matches('(?s).+')` + `size() <= 100`; URL için `matches('^https://.+')` + `size() <= 1000` kullanıldı. Liste sayısı/tekillik ve belge alan whitelist kontrolleri korundu. `matches()` yalnız string üstünde çalışır; yanlış türler emülatörde reddedildi. Multiline etiket/label semantiği önceki politikayla korundu.

**Regex sonrası gerçek 12 parça + 8 etiket + 10 bağlantı transaction’ı yine ana belge create değerlendirmesinde 1000 sınırına takıldı.** Ancak bu ölçümden sonra bağlantılar da alt koleksiyona taşındı.

## Uygulanan v2 modeli ve geçiş

- Ana belge: `manifestVersion: 2`, `chunkCount`, `linkCount`, `sizes` ve diğer metadata; `chunks` veya `links` dizisi yok.
- `chunks/{i}`: `index`, `size`, `data`; deterministik dengeli boyut, gerçek bayt boyu ve canonical path doğrulanır.
- `links/{i}`: `index`, `label`, `url`; tek belgeyi doğrulayan sabit maliyetli kural. En fazla on bağlantı. Üyelik, sahip/yönetici erişimi ve pending durumu zorunlu; yayımlanmış bağlantıların anonim/doğrulanmamış okuması reddedilir.
- Oluşturma: ana belge + bütün parçalar + bağlantılar + kota **tek transaction**. Güncellemede parça/bağlantı kuyruk temizliği; silmede her iki alt koleksiyon ve kota aynı transaction’da ele alınır.
- `src/content/manifest.ts` / `chunks.ts` dengeli bölümleme üretir. Eski bölme sınırlarıyla verilen içerik servis sınırında yeniden bölünür, bayt sırası korunur.
- `src/data/converters.ts` v2 manifesti toplam/count’tan türetir; v1 saklı manifesti korur. `src/data/service.ts` bağlantıları okur, eksik/geçersiz bağlantıda hata verir. Viewer ve editor v1/v2 okuyabilir; eksik/bozuk parçalar birleştirme öncesinde reddedilir.
- Eski v1 kaydı okuyup onaylamak toplu veri değişikliği gerektirmez. Metadata edit’inde eski ikili alanlar immutable kalır; linkler alt koleksiyona taşınır, binary sürümü 1 kalır. İçerik değişiminde manifest dizisi silinir ve bütün parçalar v2 olarak aynı transaction’da yazılır. Eski inline links değiştirilemez; değişiklik dış bağlantı modeliyle yapılır.
- Kota, üyelik, kategori/etiket, boyut limitleri ve `admins.active` politikası korunur. Gerçek canlı kayıtlara dönüşüm/silme yapılmadı.

Tam backend **160 geçti, 0 başarısız, 0 skip**. Sınır regresyonu gerçek servisle 12 parça + 8 azami etiket + 10 azami label/URL + azami title/description/cover oluşturma ve onayı; bayt sırasını koruma, replacement, quota ve orphan temizliğini doğrular. V1 tam katalog kaydı okuma/onay/edit/replacement testi ve 19 bağlantı tür/erişim testi eklendi. [Backend sonuçları](kanit/son-kontrol-2026-10-06/backend.json).

`npm run test:manifest-prototype` artık **üretim firestore.rules** dosyasını demo projede sınar. Bütçe ve bağımsız profiler fixture’ları yalnız test içindir. Son mimari kabul ve final ana belge maliyeti son kontrol raporunda; tüm komutlar sıfır skip’i zorunlu tutar.

## Yayın incelemesi için kalan koşullar

V2 yerelde test edildi; yeni kurallar canlıda henüz yok. V2 yazımları mevcut canlı kurallarla reddedilebilir. Push/deploy yapılmadı. Somut commit, kural/bundle hash’leri, hedef hostname ve geri dönüş paketi incelendikten sonra ayrı kullanıcı yayın yetkisi gerekir. Sıra kurallar → Hosting.

**Eski Hosting bundle’ına tek başına rollback v2 kayıtlarla uyumlu değildir.** V2 okuyabilen bir geri dönüş bundle’ı ve üyelik/yönetici sınırlarını koruyan uyumlu kurallar birlikte hazırlanmalı. Kuralların yalnız v2 yeni kayıt kabul etmesi eski açık sekmelerin v1 yazımlarını reddeder; yayın sırasında yazım geçişi ve istemci yenilemesi planlanmalıdır. Bu çalışmada yayın uygulanmadı. Yayın sonrası gerçek origin CSP/cache, OAuth ve iki hesaplı sunum/yönetim kabulü açık kalır.

Final v2 parent ölçümü aynı 8 etiket/10 bağlantı/count=12 metadata ile tags **120**, linkCount kontrolü **18**, diğer alanlar/boyutlar/kategori **221** AST değerlendirmesi/çağrı kaydetti. Link belgelerinin doğrulaması parent maliyetine dahil değildir. [Final parent özeti](kanit/son-kontrol-2026-10-06/parent-final-v2.json). Mimari kabul **27/27, sıfır skip**; user-provided bütçe ayrımı kontrolü de geçti.
