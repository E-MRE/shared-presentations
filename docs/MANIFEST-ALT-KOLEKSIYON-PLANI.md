# Manifest alt koleksiyon prototipi — 6 Ekim 2026

**İstenen 1/6/12 parça ve sekiz etiket deneyi geçti. İfade bütçesi emülatörde her belge yazımı için ayrı uygulanıyor. Tam ürün geçişi henüz uygulanmadı; yayın yok.** Ek sınır kombinasyonu, sekiz etiket + on bağlantı, ana belgede hâlâ 1000 ifade limitine ulaşıyor.

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

## İzole prototip ve sonuç

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

## Önerilen uygulama geçişi

1. `src/content/chunks.ts` dengeli bölümlemeyi üretsin; tipler/mapper/validation iki sürümü okuyabilsin. Yeni oluşturma ve içerik değiştirme v2 kullansın. Mevcut v1 kayıtları otomatik veya canlı toplu dönüşüme tabi tutulmasın.
2. `src/data/service.ts` ana manifest dizisini yazmasın; çocuklara `size` eklesin. Mevcut tek transaction, kota bağları, içerik değişiminde kuyruk temizliği ve silmede sıfır yetim parça davranışı korunsun.
3. Geçiş kuralları v1 okumayı sürdürsün. v1 metadata/onay güncellemesinde ikili alanlar değişmiyorsa mevcut manifest yeniden baştan açılmasın; ikili alanlar değişiyorsa bütün içerik v2 olarak aynı transaction’da yeniden yazılsın. Tür/alan/kota/üyelik/yönetici denetimleri korunmalı; eksik `admins.active` ve `true` aktif, false/hatalı tür pasif kalmalı. Bu geçiş politikası henüz prototipte yok ve test edilmeden ürün kuralına alınmamalı.
4. **Sekiz etiket + on bağlantı sorunu ayrıca çözülmeli.** Aynı unrolled doğrulamayı ana belgede bırakmak tüm kombinasyonları garanti etmiyor. Bağlantılar için de sabit maliyetli belge modeli değerlendirilmeli; önce aynı tam sınır kombinasyonu ve kota/getAfter limitleriyle emülatörde ölçülmeli. Etiket/bağlantı doğrulamasını gevşeterek mevcut testi geçirme önerilmiyor.
5. Gerçek servis ile yeni/sürüm-1 kayıt, azami sınır kombinasyonları, metadata edit, replacement, onay/ret, kota ve kuyruk temizliği testleri; ardından tam backend sıfır skip, lint/build/unit/E2E/release kontrolleri. Prototip geçmesi uygulama servisinin düzeldiği anlamına gelmez.
6. Son commit, üretim kuralı ve bundle hash’leri, hostname ve geri dönüş planı kullanıcı incelemesine sunulsun. Kullanıcı ayrıca yayın yetkisi verirse kurallar → Hosting; yayın sonrası CSP/cache ve gerçek origin kabulü o zamana kadar açık.

Mevcut uygulama v1 backend kabulü hâlâ başarısızdır. Bu belge, ölçülmüş geçiş planıdır; yayın onayı veya hazır üretim kuralı değildir.
