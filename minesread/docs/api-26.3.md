# 26.3 gözlem API düzeltmeleri

Bu değişiklikler Mineflayer tabanlı kütüphanenin veri okuma, olay ve eylem API'lerini geliştirir. Davranış kararları API'yi kullanan uygulamaya aittir.

## Mojang referansı

Minecraft Java 26.3, protokol 777 kullanıldı. Sınıf adları açık olan resmî JAR bytecode'u `javap -p -c` ile incelendi; başka bir Minecraft sürümünün davranışı 26.3 yerine varsayılmadı.

- Client SHA-1: `e877b6a07acd633fb3bb475002175cec036e7b87`
- Server SHA-1: `33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c`
- [Resmî sürüm manifesti](https://piston-meta.mojang.com/v1/packages/9f67e10ed013deeaad20ac3c800652765d493408/26.3.json)
- `ClientPacketListener.handleChunksBiomes`, `ClientChunkCache.replaceBiomes`: yalnız yüklenmiş chunk biyomlarını güncelleme.
- `ClientPacketListener.handleItemCooldown`, `ItemCooldowns`: grup anahtarı, istemci tick'iyle süre, sunucudan ekleme/kaldırma.
- `ClientboundDamageEventPacket`: hasar türü, sorumlu ve doğrudan kaynak kimlikleri, isteğe bağlı kaynak konumu.

## Görüş

`blockAtCursor` ve `blockAtEntityCursor` sıfır yaw/pitch değerlerini kabul eder. Işın göz yüksekliğinden başlar; `eyeHeight` yoksa önceki `height` davranışına döner. Bilinmeyen açılar için sonuç `null` kalır.

`entityAtCursor` erişimi varlık merkezinden değil gözden vurulan kutuya kadar ölçer. Duvar arkasındaki hedefi seçmez. Bu değişiklik ejderha multipart hedefleme desteği eklemez.

## Biyom

`bot.blockAt(position).biome`, sayısal biyom kimliğini bağlantının güncel registry'sinden çözer. Önceki boş ad, `prismarine-block` bağımlılığının biyom oluşturucusuna registry yerine sürüm nesnesi vermesinden kaynaklanıyordu. Yüklenmeyen bloklar hâlâ `null` döner; bilinmeyen biyom kimliğine hayalî bir ad atanmaz.

`chunk_biomes` paketleri yüklenmiş sütunun biyom paletlerini yeniler, blok ve ışık verisini korur. Bir sütunun eksik/bozuk verisi kısmen uygulanmaz; `error` olayı yayılır. Yüklenmemiş sütun oluşturulmaz.

`chunkBiomesUpdate(columnCorner)` güncellenen sütunun köşesini blok koordinatında (`Vec3`, y=0) verir. Bu olay her hücre için `blockUpdate` üretmez.

Biyom çözümü `bot.world.getBlock`, asenkron dünya okuması, yüklü sütunların `getBlock` yöntemi ve raycast sonuçlarında da uygulanır.

Güncelleme paketleri 9-bit özel doğrudan paletleri de destekler. İlk `map_chunk` yüklemesindeki bağımlılık codec’inin 8 bitten büyük özel doğrudan biyom paleti sınırı bu değişiklikte kaldırılmadı; standart 26.3 biyomları bu sınıra takılmaz.

Palette okuyucusu, sabitlenmiş `prismarine-chunk` sürümünün iç `PaletteBiome` codec'ini kullanır. Bağımlılık güncellenirken bu yol ve codec testleri de kontrol edilmelidir.

## Eşya cooldown'u

- `bot.getItemCooldown(itemOrGroup)` kalan istemci tick sayısını döndürür. Eşya nesnesi, sayısal eşya kimliği, grup adı veya `null` kabul eder; aktif bekleme yoksa `0` verir.
- `bot.getItemCooldownGroup(itemOrGroup)` grup anahtarını verir; eşya yoksa `null` döner.
- `itemCooldown(group, ticks)` sunucunun süre koyduğunu/yenilediğini bildirir.
- `itemCooldownEnd(group)` aktif sürenin dolduğunu veya kaldırıldığını bildirir.
- `clientTick` hareket simülasyonundan bağımsız istemci tick'idir; fizik devre dışıyken veya chunk eksikken de hazır oyuncunun cooldown sayacı ilerler. Physics eklentisinin bütünü kapatılırsa tick kaynağı da yoktur.

26.3'te anahtar `cooldownGroup`, süre `cooldownTicks` alanından gelir. Eski sürümlerin sayısal eşya paketleri `item:<id>` anahtarıyla desteklenir. Özel `use_cooldown` bileşeninin grup adı eşya nesnesinden çözümlenir; grup string'i doğrudan da sorgulanabilir. Eşya adıyla sorgulama özel bir stack'in bileşenlerini bilemez; o durumda stack nesnesini kullanın.

Cooldown paketi, Mojang istemcisindeki gibi eşya kullanımını veya bekleyen yeme işlemini tamamlamaz. Sıfır süre aktif kaydı kaldırır; diğer süreler kaydı yeniler. Yeniden doğuş, yeni bağlantı ve configuration geçişinde oyuncuya ait kayıtlar temizlenir.

Bu API saldırı doluluk göstergesi değildir ve sunucuda eşya kullanımının kesin başarılı olacağını garanti etmez.

## Hasar

Eski `entityHurt(entity, source)` olayı korunur. Kaynak veya hedef yüklenmemişse entity referansı bulunmayabilir. Yeni `entityDamage(damage)` olayı şu alanları taşır:

| Alan | Anlam |
| --- | --- |
| `entityId`, `entity` | Hedef kimliği ve varsa yerel varlık |
| `sourceTypeId`, `sourceType` | Ağdaki hasar türü kimliği ve oturum registry'sinden çözülen namespaced ad |
| `sourceCauseId`, `sourceCause` | Sorumlu varlık kimliği ve varsa varlık |
| `sourceDirectId`, `sourceDirect` | Doğrudan vuran varlık/mermi kimliği ve varsa varlık |
| `sourcePosition` | Paket konum taşıyorsa `Vec3`, aksi hâlde `null` |

Kaynak ID'lerinden protokolün `+1` kodlaması çıkarılmıştır; kaynak yoksa `null` kullanılır. Kimlik mevcut ama varlık yüklenmemişse kimlik korunur, referans `undefined` olur. Bilinmeyen hasar türüne ad uydurulmaz. Hasar miktarı bu pakette bulunmaz.

## Doğrulama sınırı

Regresyonlar gerçek 26.3 registry ve protokol codec'iyle yerel testlerde doğrulanır. Bu oturumda vanilla sunucu/EULA kurulumu ve canlı savaş testi yapılmadı. Yerel testler, canlı sunucudaki tüm etkileşimlerin doğrulandığı anlamına gelmez.

TypeScript tüketici testi `--strict --skipLibCheck --esModuleInterop` ile kontrol edilir. `skipLibCheck`, bağımlılıkların mevcut bildirim hatalarını ayırır; bütün bağımlılık bildirimlerinin hatasız olduğu iddia edilmez.

## Bu değişiklikte çalıştırılan kontroller

- Yeni regresyon ve protokol testleri: 43 başarılı (`biomeCooldownTest`, `biomeProtocolTest`, `cooldownProtocolTest`, `visionDamageTest`).
- Mevcut 26.3 iç testleri: 64 başarılı, 1 atlanan.
- Değişen JavaScript dosyalarının Standard kontrolü başarılı.
- Yeni API'nin TypeScript tüketici testi başarılı (`test/types/observation.ts`, strict + skipLibCheck + esModuleInterop).
- Genel `npm run lint`, değiştirilmeyen probe/smoke scriptlerindeki mevcut 7 lint ihlalinde duruyor. Genel `tsc --noEmit`, bağımlılıkların tip bildirimlerinde hata veriyor. Bu bağımlılık hataları bu işte topluca değiştirilmedi.
- İç test çıktısında bazı bağlantı kapatma/protokol okuma tanıları mevcut; test runner bunları başarısız test saymıyor. Sonuç canlı vanilla uyumluluğu garantisi olarak yorumlanmamalı.
