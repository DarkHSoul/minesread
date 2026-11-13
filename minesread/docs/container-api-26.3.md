# Envanter, sandık, üretim ve ticaret API'si — 26.3

Minesread bu ekranlarla oyun protokolü üzerinden etkileşir. Grafik pencereyi açmak, fareyi hareket ettirmek veya görsel düğme tanımak gerekmez. İşlem seçimini API'yi kullanan uygulama yapar; sunucunun mesafe, izin, malzeme ve oyun modu kuralları geçerlidir.

| İşlem | API |
| --- | --- |
| Envanter ve imleçteki eşyayı okumak | `bot.inventory.slots`, `window.selectedItem` |
| Slot almak, bırakmak, bölmek, hızlı taşımak, hotbar/offhand değiştirmek | `bot.clickWindow(slot, button, mode)` |
| Eşya taşımak, kuşanmak, atmak | `transfer`, `moveSlotItem`, `equip`, `unequip`, `toss` |
| Sandık ve benzeri depoları açmak | `await bot.openContainer(blockOrEntity)` |
| Depoya koymak / depodan almak | Dönen pencerenin `deposit`, `withdraw` metotları |
| Pencereyi kapatmak | `await window.close()` veya `await bot.closeWindow(window)` |
| Statik üretim tariflerini bulup üretmek | `recipesFor`, `recipesAll`, `await craft(recipe, count, table)` |
| Sunucu tarif kitabını okumak | `getServerRecipes`, `getServerRecipe` |
| Tarif kitabından malzeme yerleştirme istemek | `requestRecipePlacement(displayId, makeAll)` |
| Köylü / gezgin tüccar tekliflerini kullanmak | `await openVillager(entity)`, `await trade(window, index, times)` |

## Slot tıklamaları

26.3 `ServerboundContainerClickPacket`, normal eşya stack'i yerine `HashedStack` alanları taşır. Yeni yol tahmini bileşen hash'leri üretmez: tıklamayı geçersiz state ID ile yollar ve sunucunun tam slot/imleç yanıtını bekler. `ServerGamePacketListenerImpl.handleContainerClick`, tıklamayı uyguladıktan sonra state ID uyuşmazlığında tam durum gönderir. Bu yaklaşım her tıklamada ağ gidiş-dönüşü gerektirir.

`ContainerInput` modları: 0 alma/bırakma, 1 hızlı taşıma, 2 hotbar/offhand takası, 3 creative klonlama, 4 atma, 5 sürükleyerek dağıtma, 6 aynı eşyaları toplama. Düğme kodları Minecraft protokolündeki anlamlarını korur; örneğin mod 2 için 0–8 hotbar, 40 offhand'dir. Creative işlemler sunucuda uygun oyun modu gerektirir.

## Üretim

`craft` 2×2 oyuncu alanını veya verilen üretim masasının 3×3 alanını kullanır. Modern sürümlerde çıktı ve kalan eşyalar sunucudan okunur; statik tarif verisinden sonuç stack'i uydurulmaz. Statik tarif veritabanı sunucunun tüm özel tariflerini içerdiği anlamına gelmez.

`requestRecipePlacement` oturuma ait, `getServerRecipes()` ile alınmış sayısal display ID kullanır. Bu metot yalnızca yerleştirme isteği gönderir; çıktı almaz ve başarılı üretim sözü vermez. Sunucunun gösterdiği eksik malzeme taslağı `recipePlacementGhost` olayıyla iletilir. Gerçek sonucu pencere slotlarından izleyin.

## Doğrulama sınırı

Ticaret teklifleri yenilendiğinde `window.tradesUpdated` olayı yayımlanır; `villagerLevel`, `experience`, `isRegularVillager`, `canRestock` alanları sunucudan okunur. Fiyat hesabı Mojang'ın float yuvarlamasını ve stack sınırını izler. İkinci ödeme isteğe bağlıdır; iki ödeme aynı eşya grubunu kullanıyorsa stok iki kez sayılmaz. Başarısız çıktı/ödeme tüketimi başarılı işlem olarak kaydedilmez.

Ticaret maliyetleri artık açık patch ve removal yanında Mojang'dan çıkarılmış 26.3 varsayılan bileşenleri de kullanır. Dinamik registry bağlantısı gerektiren bazı varsayılanlar hâlâ bilinmiyor olabilir; sınırlar [temel uyumluluk denetiminde](compatibility-audit-26.3.md) açıklanır. Düşük seviyeli slot API'si işlemi sunucuya iletmeye devam eder.

Kanıt metotları: `ClientPacketListener.handleSetCursorItem` ve `handleContainerContent` imleç/slot uygulaması; `ResultSlot.onTake` üretim tüketimi ve kalanlar; `ServerGamePacketListenerImpl.handlePlaceRecipe` oturum display ID ve kilit kontrolü; `MerchantOffer.getModifiedCostCount` fiyat; `ItemCost.test` bileşen koşulları; `ServerGamePacketListenerImpl.handleSelectTrade` aktif ticaret menüsü kontrolü.

Resmî `client-26.3.jar` SHA-256: `4508d006323f24fa02876310c192d739af56516eb259000ac50f0909a68c9a2d`. İnceleme statik JAR koduna, gerçek protokol codec'ine ve yerel regresyonlara dayanır. Canlı vanilla sunucusunda bütün ekranların uçtan uca test edildiği iddia edilmez. Örs, büyü masası ve diğer özel menüler bu dört ekran grubuna yönelik incelemenin kapsamı dışındadır.
