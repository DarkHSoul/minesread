# minesread: proje amacı

## Amaç

Mineflayer ile aynı amaç doğrultusunda, Minecraft sunucusuna bağlanan istemciler için programatik veri okuma ve eylem API'si sunmak. minesread, uygulamaların ve eklentilerin kullanacağı bir Node.js kütüphanesidir.

Kütüphane sunucudan alınan veriyi işler, istemci durumunu tutar ve çağrılan eylemleri protokole aktarır. Hangi hedefin izleneceğine ve hangi eylemin ne zaman yapılacağına kütüphaneyi kullanan uygulama karar verir.

## Kapsam

- Bağlantı, protokol ve sürüm uyumluluğu; mevcut öncelik Minecraft Java 26.3 / protokol 777.
- Blok, chunk, biyom, varlık, envanter, can, etkiler ve diğer sunucu verilerine erişim.
- Veri değişikliklerini bildiren olaylar ve tutarlı istemci durumu.
- Hareket, bakış, kazma, blok yerleştirme, saldırı, eşya kullanımı, üretim ve mevcut Mineflayer eylem API'leri.
- Cooldown, hasar, saldırı doluluğu, isimli metadata, sunucu tarifleri ve advancement gibi yardımcı API'ler.
- JavaScript/TypeScript sözleşmeleri, eklenti uyumluluğu, testler ve dağıtım paketi.

Otonom oynama, görev seçimi, refleks/tehlikeden kaçınma politikaları, beceri scriptleri, planlayıcı, run kuralları ve dil modeli entegrasyonu bu deponun ürün kapsamı dışındadır. Bunlar ihtiyaç duyan ayrı uygulamalar tarafından API'nin üzerinde kurulabilir. Ender Dragon'a ulaşmak veya oyunu bitirmek projenin başarı ölçütü değildir; ejderha bilgisi ve hedefleme desteği genel varlık API'sinin parçasıdır.

## Mineflayer ile ilişki

Bu depo bir Mineflayer fork'udur. Kütüphane kodu kökte (`lib/`, `index.js`, `index.d.ts`); fork'a özgü belgeler ve geliştirme/test araçları `minesread/` altındadır.

Mevcut API davranışları ve eklenti uyumluluğu korunur. Sürüm uyarlamaları ve düzeltmeler gerektiğinde upstream'e taşınabilir. Bağımlılıkların mevcut sabit commit'leri README'de belirtilir; upstream ile eşitleme sürüm uyumluluğu doğrulanarak yapılır.

## Veri ve kesinlik ilkeleri

- Canlı sunucu verisi, protokol kimlikleri ve registry eşlemeleri doğru işlenir.
- Bilinmeyen/yüklenmemiş veri biliniyormuş gibi sunulmaz.
- Gözlenen durum, hesaplanan tahmin ve eylemin sunucu tarafından doğrulanmış sonucu ayrılır.
- Mojang JAR incelemesi protokol ve davranış doğrulaması içindir; sunucunun göndermediği dünya durumunu bildiğimiz anlamına gelmez.
- Yaklaşık ejderha konumları ve koşullu patlama hesabı gibi sınırlamalar API sözleşmesinde açıkça belirtilir.

## Başarı ölçütleri ve sıradaki işler

API doğruluğu, protokol uyumluluğu, kararlı olay/yaşam döngüsü, mevcut eklentilerin çalışması ve tekrarlanabilir test/build sonuçları temel ölçütlerdir. Sıradaki işler API açıklarının kapatılması, regresyonların giderilmesi ve gerçek 26.3 sunucusunda doğrulamadır.

Test/probe scriptleri kütüphaneyi doğrulayan geliştirme araçlarıdır; otonom uygulamanın başlangıcı olarak değerlendirilmez. Önceki bağlantı/eylem testleri ile son API değişikliklerinin canlı doğrulaması ayrı tutulur.

- [API kapsamı ve build](api-kapsami-26.3.md)
- [İlk API düzeltmeleri](api-26.3.md)
