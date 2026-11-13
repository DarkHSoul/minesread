# 26.3 temel uyumluluk denetimi

Bu çalışma birleşmiş ilk API PR'ının üzerine yapılmıştır. Amaç istemci API'sinin altında sessiz veri hatası veya paket okuma bozulması yaratabilecek farkları Mojang JAR'ıyla karşılaştırmaktır.

| Alan | Sonuç ve kanıt |
| --- | --- |
| Paketler | Takım seçenek bayrakları düzeltildi. Üç HolderSet alanı, teleport efektinin son boolean alanı ve sign text'in isteğe bağlı filtreli metni düzeltildi. Gerçek Mojang baytları tam okunup tekrar aynı biçimde yazılıyor. [Kanıt](evidence-protocol-compat-26.3.md) |
| Sayısal kayıtlar | 122 component, 128 particle ve 44 metadata serializer kayıt sırası karşılaştırıldı. Bu listelerde kimlik kayması bulunmadı; tüm iç payload'ların eksiksiz denetlendiği iddia edilmez. |
| Chunk | İlk `map_chunk` yüklemesi artık paket genişliğini kullanıyor; 9-bit biyom paletleri destekleniyor. Direct blok JSON verisi, uzunluk bayrağı ve iki boş ışık maskesinin saklanması düzeltildi. [Kanıt](evidence-chunk-compat-26.3.md) |
| Eşyalar | 1658 vanilla eşyanın varsayılan bileşenleri Mojang codec'inden çıkarıldı. Merchant, cooldown, tüketim ve stack sınırı hesapları patch/removal/default sırasını kullanıyor. [Kanıt](evidence-item-compat-26.3.md) |
| Yaşam döngüsü | Dünya türü aynı olsa bile farklı dünya kimliği eski chunk/entity verisini temizliyor. Eski disk kaydı yeni dünyayı bloke etmiyor; configuration menü işlemleri iptal ediliyor, registry verisi geçersizleştiriliyor ve sonraki login hazırlık bildirimi yeniden gönderiliyor. [Kanıt](evidence-lifecycle-compat-26.3.md) |

## Etkin eşya verisi

- `bot.getItemComponent(item, type)`: `{ known, present, value? }`. `known: false`, yok olduğu değil çözülemediği anlamına gelir. `minecraft:` öneki kullanılabilir.
- `bot.getItemStackSize(item)`: patch uygulanmış stack sınırı.
- `bot.getItemDamage(item)`: etkin maksimum dayanıklılık aralığına sınırlandırılmış hasar.
- `bot.getItemMaxDurability(item)`: etkin maksimum dayanıklılık.

Ham prismarine-item alanları yeniden yazılmaz; etkin değer gerektiğinde bu metotlar kullanılır. Varsayılan karmaşık component değerleri çağrıya özel kopyalanır; bir çağıran ortak veri tablosunu değiştiremez.

## Kalan sınırlar

88 eşyanın bazı varsayılan bileşenleri dinamik registry bağlantısı gerektirdiğinden çıkarıcıda kodlanamadı; bu alanlar açıkça bilinmiyor olarak işaretlenir. Son çıkarımda **decoder/şema hatası kalmadı**. Açık stack patch'leri bu alanlarda yine okunabilir. Vanilla 26.3 varsayılanları, özel sunucuların farklı default component veri setleri için garanti değildir.

Chunk testleri 17-bit blok genişliğini korur; bu, vanilla blok registry'sinin 17 bit gerektirdiği anlamına gelmez. 32-bit paletler ve Anvil/NBT disk sağlayıcıları kapsam dışında. Testler gerçek protokol codec'leri, eklentiler ve JSON storage kullanır; canlı vanilla/proxy oturumu bu çalışmada açılmadı.

Doğrulama komutu `npm run build`: syntax, genel lint, API tip kontrolü, API regresyonları, 26.3 dahili testleri ve yerel paket üretimi.
