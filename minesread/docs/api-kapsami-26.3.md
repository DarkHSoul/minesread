# 26.3 API kapsamı ve build

Bu çalışma, ilk görüş/biyom/cooldown/hasar düzeltmelerinin üzerine kalan motor API katmanlarını ekler. Projenin amacı Mineflayer gibi bir istemci API kütüphanesi sunmaktır; davranış politikaları ve görev planlama API'yi kullanan uygulamalara aittir.

## Eklenen API'ler

| Alan | Kullanım | Sözleşme |
| --- | --- | --- |
| Saldırı | `getAttackStrengthDelay`, `getAttackStrengthScale`, `getItemSwapScale`, `getAttackCooldownTicks` | Etkin attack-speed attribute'u ve yerel tick'ler; bilinmeyen attribute `null`. `attack` eski davranışı korur ve vanilla istemci gibi sayaçları sıfırlar. |
| Varlık durumu | `getEntityMetadata`, `getEntityState` | Ham metadata korunur; isimli health, pose, bayraklar, donma, creeper/blaze/enderman durumları. Bilinmeyen alan `undefined`; mob hedefi veya kesin fuse süresi uydurulmaz. |
| Ejderha | `getDragonPhase`, `getEntityParts`, `entityParts`, `entityPartAtCursor` | Sekiz parça, sabit kimlik/boyut, hareket geçmişi ve evreye bağlı tahmini konum. Parça `attack(part)` ile hedeflenebilir. |
| Patlama | `getExplosionDamageEstimate` | `rawDamage`, savunma sonrası `damage`, absorpsiyon sonrası `healthDamage`, eksik veri için `reasons`. Kaynak ve savunma koşulları açıkça belirtilir. |
| Sunucu tarifleri | `serverRecipes`, `getServerRecipe`, `getServerRecipes` | Numeric display ID ile sunucunun tarif kitabı; property set, stonecutter, highlight/settings, ekleme/silme/replace. Statik crafting API'sinden ayrıdır. |
| Advancement | `advancements`, `getAdvancement`, `getAdvancements`, `isAdvancementDone` | Reset, tanım/ilerleme güncelleme, alt ağaç silme; AND içindeki OR koşulları. Tanım/ebeveyn/ilerleme eksikse tamamlanma `null`. |

Olaylar ve tüm argümanlar `index.d.ts` ile `lib/observation_types.d.ts` içinde tanımlıdır. `test/types/remainingApis.ts` derlenen tüketici örneğidir. Yeni eklentiler varsayılan yükleyiciye bağlandı.

## Kesinlik sınırları

- Ejderha parçalarının kimlikleri ve boyutları JAR'dan doğrudan doğrulandı. Konumlar **yaklaşıktır**: vanilla uzaktan varlık interpolasyonu ve senkronize olmayan `yRotA` düzeltmesi birebir yeniden üretilmez. `confidence` daima `approximate` kalır; `historyComplete` kesinlik garantisi değildir. Ayrı `entityPartAtCursor` bunu mevcut `entityAtCursor` dönüş tipine gizlemez.
- Patlama API'si tek vuruşluk koşullu hasar hesabıdır. Otomatik görüş örneklemesi yüklü hava/sıvı ve sıradan tam blok şekillerini destekler; eksik chunk veya bağlama bağlı/kısmi şekiller belirsizdir. `exposure` veya güvenilir `rayClear` verilebilir. Zırh modern attribute'lardan çözülür; enchantment protection, resistance ve damage-source koşulları bilinmelidir. Veri paketlerinin sunucu tarafındaki koşullarını istemci verisinden bildiğini iddia etmez. Eski `getExplosionDamages` bilinmeyen savunma durumunda `null` verebilir; raw mod desteklenen yüklü dünyada sayısal sonuç üretir.
- Saldırı doluluğu yerel istemci modelidir; vuruşun kabul edildiğinin kanıtı değildir. Invulnerability, bloklama, bağışıklık ve sunucu özelleştirmeleri hesap dışında kalır.
- Tarif ekran verisi bütün özel recipe/crafting mantığını içermez. `recipesFor` / `recipesAll` statik tarif veritabanını kullanır; modern `craft` sonucu sunucudan doğrular. [Envanter, üretim ve ticaret kapsamı](container-api-26.3.md) ek etkileşimleri ve sınırları açıklar.
- Vanilla sunucu ve canlı Nether/End dövüş testi bu çalışma kapsamında çalıştırılmadı. Yerel protokol testleri bunun yerine geçti diye sunucuda bitiriş garantisi verilmez.

## Kanıt zinciri

İlk raporda doğrulanan resmî 26.3 client JAR SHA-1: `e877b6a07acd633fb3bb475002175cec036e7b87`; protokol 777. Her alt görev için sınıf/metot ve bytecode ofsetleri:

- [Savaş ve patlama](evidence-combat-26.3.md)
- [Varlıklar ve ejderha](evidence-entities-26.3.md)
- [Tarifler ve advancement](evidence-progression-26.3.md)
- [İlk dört API düzeltmesi](api-26.3.md)

Uygulama üç GPT-6.1 SOL ajanına bölündü; ardından üç ayrı SOL ajanı salt okunur davranış/sözleşme/build incelemesi yaptı. Üst ajan değişiklikleri birleştirdi, tipleri ve multipart saldırı entegrasyonunu doğruladı. Bulgular test ve kanıtlarla değerlendirildi; yaklaşık bilgiler kesin olarak sunulmadı.

## Build

Proje CommonJS kaynaklarını doğrudan çalıştırır; ayrı bir makine kodu/EXE derlemesi yoktur. `npm run build` sırasıyla sözdizimi kontrolü, genel lint, API tüketici TypeScript kontrolü, API testleri ve 26.3 iç testlerini çalıştırır. Ardından `npm pack --ignore-scripts` ile yerel `.tgz` ve SHA-256 içeren `build-manifest.json` üretir. Yayınlama/push yapmaz.

```sh
npm install --allow-git=root
npm run minesread:setup-data
npm run build
# Alternatif çıktı klasörü:
npm run build -- --out /absolute/output/path
```

Varsayılan çıktı `dist/` altındadır. Paket yalnız kaynak, bildirim, script ve belgeleri taşır; Mojang JAR'ları, dünya, vendor checkout ve node_modules paketlenmez. Bağımlılıklar bundle edilmez: arşiv açıldıktan sonra kurulum ve `minesread:setup-data` adımları gerekir. TypeScript tüketici kontrolünde `skipLibCheck`, bağımlılıkların mevcut bildirim hatalarını dışarıda bırakır; tüm üçüncü taraf bildirimlerinin hatasızlığı iddia edilmez.

## Git incelemesi sonrası düzeltmeler

- 26.3 attribute paketindeki eski mapper kaldırıldı; ağdaki sayısal kimlikler entity katmanında güncel registry adına çevrilir. JAR `Attributes` kayıt sırasındaki 40 değer veri tablosuyla karşılaştırıldı. ID 5 artık `minecraft:attack_speed`; değer 4 için gecikme 5 tick. `Attribute.STREAM_CODEC` → `ByteBufCodecs.holderRegistry` → `$32` kimlikleri offsetsiz taşır. Düzeltme hem uygulama başlangıcında codec derlenmeden önce hem `minesread:setup-data` sırasında uygulanır. Ham `_client` attribute paketinde `key` artık sayısal kimliktir; `entity.attributes` namespaced anahtarlar sunar. Eski sürümler değişmez.
- Biyom paleti başarıyla güncellendiğinde `world.async.saveAt` ile kayıt kuyruğuna alınır. Hatalı veya yüklenmemiş sütun için kayıt yapılmaz. Gerçek World/Chunk ve sahte storage ile save → update → save → unload → reload doğrulandı.
- Aynı dünyada yeniden doğuş yaşayan ejderha parçalarını artık kalıcı olarak emekliye ayırmaz. Dünya değişirse temizleme korunur. JAR `ClientPacketListener.handleRespawn` 47–76 aynı dimension anahtarında ClientLevel'ı korur; 79–201 farklı dünya için yeniden oluşturur. Gerçek entity eklentisiyle lifecycle regresyon testi eklendi.

Bu üç düzeltmeye ilişkin testler: `attributeProtocolTest.js`, `biomePersistenceTest.js`, `multipartTargetTest.js`. API testleri uygulama girişini önceden yükleyerek (`--require ./index.js`) üretimdeki protokol bootstrap sırasını kullanır. Veri kurulumu yeniden çalıştırıldıktan sonra da testler geçer.
