# minesread

Minecraft'ın iç dünyasını (bloklar, varlıklar, envanter, can) okuyup bu bilgiyle kural tabanlı,
temkinli ve hedef odaklı oynayan bir bot. Amaç: her run'da verilen kurallara göre oyunu bitirmek
ya da istenen görevi yapmak.

## Durum

Mineflayer yığını **Minecraft 26.3** (protokol 777) için hazırlanıyor. Resmî npm sürümleri 26.3'ü henüz
desteklemediği için birleştirilmemiş PR dalları, **commit SHA'sına sabitlenmiş** olarak kullanılıyor:

| Paket | Kaynak |
|---|---|
| mineflayer | suisarbre/mineflayer `ad4af126` (PrismarineJS/mineflayer#4206) |
| minecraft-protocol | suisarbre/node-minecraft-protocol `3473413d` (PrismarineJS/node-minecraft-protocol#1553) |
| minecraft-data (veri) | suisarbre/minecraft-data `312f3cad` (PrismarineJS/minecraft-data#1345), veri-only |

PR'lar upstream'de birleşince bu sabitlemeler resmî sürümlere çevrilecek.

## Kurulum

```bash
npm install            # .npmrc: ignore-scripts=true, kurulum betikleri çalışmaz
npm run setup:data     # 26.2/26.3 verisini node_modules/minecraft-data içine yazar (her npm install sonrası)
npm run check          # hangi sürümler için veri var
```

`npm install` git bağımlılıkları için npm 12'de `--allow-git=root` ister.

## Test sunucusu ve duman testi

```bash
npm run server:setup -- --accept-eula   # resmî server.jar'ı indirir, SHA-1 doğrular (EULA'yı kabul etmek sizin sorumluluğunuzda)
npm run server                          # Java 25 ile başlatır (Prism'in java-runtime-epsilon'u bulunur)
npm run smoke                           # botu bağlar: spawn, blok/envanter okuma, yürüme, 20 sn bağlantı
```
