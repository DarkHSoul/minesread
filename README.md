# minesread

Minecraft'ı kendi başına oynayan, scriptlerle çalışan, hedef odaklı ve temkinli bir bot.
Bu depo bir [Mineflayer](https://github.com/PrismarineJS/mineflayer) fork'udur: Mineflayer'ın kendisi
kökte (`lib/`, `index.js`), projeye özgü her şey `minesread/` klasöründedir.

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

- Savaş, lav kaçınma ve gece/canavar davranışları henüz test edilmedi (test sunucusu barışçıl).
- Blok biyomu 26.3'te boş dönüyor.
- minecraft-data #1346 (takım paketi sırası) dahil değil.
- Botun beyin katmanları (gözlem, refleks, beceri, planlayıcı) henüz yazılmadı.
