# minesread

Minecraft sunucusuna bağlanan uygulamalar için veri okuma, olay ve eylem API'si sunan Node.js kütüphanesi. Amaç, forklandığı Mineflayer ile aynıdır.
Bu depo bir [Mineflayer](https://github.com/PrismarineJS/mineflayer) fork'udur: Mineflayer'ın kendisi
kökte (`lib/`, `index.js`), fork'a özgü belgeler ve test/kurulum araçları `minesread/` klasöründedir.

- Proje amacı ve mimari: [minesread/docs/proje-amaci.md](minesread/docs/proje-amaci.md)
- Mineflayer belgeleri: [docs/README.md](docs/README.md)

## Durum

**Minecraft 26.3** (protokol 777) üzerinde gerçek bir vanilla sunucuda doğrulandı:
bağlantı testi 11/11, eylem testi 7/7 (kazma, eşya toplama, blok koyma, yol bulma).

Upstream 26.3'ü henüz birleştirmediği için bu fork, incelenmiş PR commit'lerinin üstüne kuruludur.
Hepsi DarkHSoul fork'larında `minesread-26.3` dalına sabitlenmiştir:

| Parça | Kaynak commit |
|---|---|
| Bu depo (Mineflayer) | PrismarineJS/mineflayer#4206 `ad4af126` üstüne |
| minecraft-protocol | DarkHSoul/node-minecraft-protocol `3473413d` (upstream #1553) |
| prismarine-chunk | DarkHSoul/prismarine-chunk `a96fd705` (upstream #347) |
| prismarine-physics | DarkHSoul/prismarine-physics `02242786` (upstream #158) |
| minecraft-data (26.2/26.3 verisi) | DarkHSoul/minecraft-data `312f3cad` (upstream #1345) |

## Kurulum

```bash
npm install --allow-git=root      # .npmrc: ignore-scripts=true
npm run minesread:setup-data      # 26.3 verisini node_modules/minecraft-data içine yazar (her npm install sonrası)
npm run minesread:check           # hangi sürümler için veri var
```

## Test sunucusu ve testler

```bash
npm run minesread:server-setup -- --accept-eula   # resmî server.jar, SHA-1 doğrulamalı (EULA kabulü size ait)
npm run minesread:server                          # Java 25 ile, yalnızca 127.0.0.1, çevrimdışı mod
npm run minesread:smoke                           # bağlantı, okuma, yürüme
npm run minesread:smoke-actions                   # kazma, toplama, koyma, yol bulma
npm run minesread:probe                           # botun sunucuda neleri görebildiğini döker
```

## Bilinen sınırlar

- Savaş ve tehlikeli ortam etkileşim API'lerinin canlı doğrulaması tamamlanmadı (önceki test sunucusu barışçıl).
- Görüş, biyom, cooldown ve hasar API düzeltmeleri: [ayrıntılar](minesread/docs/api-26.3.md). Yerel regresyon/protokol testleri mevcut; canlı vanilla doğrulaması henüz yapılmadı.
- minecraft-data #1346 (takım paketi sırası) dahil değil.
- Otonom oynama ve planlayıcı bu kütüphanenin kapsamı dışındadır; kararlar API'yi kullanan uygulamaya aittir.

## API doğrulama ve yerel build

Kalan API katmanları, Mojang 26.3 bytecode referansları ve kesinlik sınırları:
[26.3 API kapsamı](minesread/docs/api-kapsami-26.3.md).

```bash
npm run test:api
npm run typecheck:api
npm run build
```

Build, lint ve testlerden sonra `dist/` altında CommonJS dağıtım paketi (`.tgz`)
ve SHA-256 manifesti üretir; bağımlılıklar paketlenmez ve otomatik yayın yapılmaz.
