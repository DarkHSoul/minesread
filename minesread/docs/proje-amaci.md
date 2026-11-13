# minesread: proje amacı

## Tek cümleyle

Minecraft'ı kendi başına oynayan, scriptlerle çalışan, hedef odaklı ve temkinli bir bot kurmak.
Bot her run'da kendisine verilen kurallara göre oyunu bitirmeye (Ender Dragon) ya da istenen
görevi yapmaya çalışır.

## Mineflayer'ın yeri

minesread bir Mineflayer fork'udur. Mineflayer motor görevi görür ve depo kökünde durur.
Projeye özgü her şey `minesread/` klasöründedir. Asıl iş motorun üstündeki beyin katmanıdır,
ama fork olduğumuz için gerektiğinde motorun içini de değiştirebiliriz.

- Bot, oyuna ayrı bir oyuncu olarak bağlanır. Kullanıcının karakterini sürmez. Tek oyunculu
  dünyada oynaması için dünyanın LAN'a açılması gerekir.
- Upstream Mineflayer 26.3'ü henüz desteklemediği için fork, incelenmiş PR commit'lerinin üstüne
  kuruludur. Bağımlılıklar DarkHSoul fork'larındaki sabit commit'lere işaret eder (ayrıntı: README).
- Upstream 26.3'ü birleştirince fork onunla eşitlenecek.
- Motorda düzelttiğimiz hatalar upstream'e PR olarak gönderilebilir.

## Davranış ilkeleri

- **Amaca göre hareket eder, kafasına göre değil.** Her eylem bir hedefe bağlıdır.
- **Speedrunner gibi ama daha temkinli.** Hızlı ilerler, ama gereksiz risk almaz.
- **Tehlikeden kaçınır.** Lavdan uzak durur, uçurum ve kıyı kenarında dövüşmez, canı azken
  geri çekilir.
- **Kurallara uyar.** Her run'ın hedefi ve sınırları bir kural dosyasından gelir.
- **Dünyayı doğrudan okur.** Ekran görüntüsü ya da kayıt dosyası yerine canlı oyun verisini
  kullanır (bloklar, varlıklar, envanter, can).

## Mimari (katmanlar)

1. **Gözlem:** botun gördüğü her şeyi tek bir dünya görüntüsüne çevirir.
2. **Refleksler:** her tick çalışır, yapay zekâ çağrısı içermez. Lav ve düşme kaçınma, can
   azken geri çekilme, yemek yeme.
3. **Beceriler:** tek iş yapan scriptler (odun topla, kazma yap, demir bul ve erit, portal kur).
   Her becerinin başarı ve başarısızlık koşulu vardır.
4. **Planlayıcı:** becerileri hedefe göre sıralar. Bir adım başarısız olursa yedek plana geçer.
   Ana zincir: odun → taş → demir → elmas → Nether → End → ejderha.
5. **Kural dosyası:** run başına hedef ("oyunu bitir", "64 demir topla"), risk seviyesi ve yasaklar.

Bir dil modeli sürekli döngüde yer almaz. Yalnızca bot takıldığında ya da serbest bir görev
verildiğinde üst seviye plan için çağrılabilir.

## Botun görebildikleri ve göremedikleri

Gerçek bir 26.3 sunucusunda `npm run probe` ile ölçüldü.

**Görür:** kendi durumu (konum, can, tokluk, XP, etkiler), yüklü chunk'lardaki tüm bloklar
(yer altı cevherleri dahil), ışık seviyeleri, varlıklar ve metadataları, zaman ve hava durumu,
tarifler, blok/eşya/varlık veri tabloları, sunucunun gönderdiği tüm ham paketler.

**Göremez:** dünya tohumu, yapıların yerleri, yüklenme mesafesinin ötesi, diğer oyuncuların
envanteri, kapalı sandıkların içeriği, mobların hedefi.

**Bilinen hata:** blok biyomu 26.3'te boş dönüyor, düzeltilmesi gerekiyor.

## Gerçekçi beklentiler

- Veri okuma çalışıyor. Zor olan yapma kısmı: her beceri tek tek yazılıp test edilecek.
- Erken zincir (odun, taş, demir) birkaç günlük iş.
- Nether, kale bulma, ender pearl toplama ve ejderha dövüşü asıl zor kısım. Tam otonom ve
  güvenilir bir bitiriş haftalar sürer. İlk sürümlerde çoğu run ölümle biter.
- Ejderhanın öldürüleceği garanti edilmiyor. Hedef, her run'da bir öncekinden ileri gitmek.

## Durum (13 Kasım 2026)

- **Bitti:** 26.3 yığını kuruldu ve gerçek sunucuda doğrulandı (bağlantı testi 11/11,
  eylem testi 7/7: kazma, eşya toplama, blok koyma, yol bulma).
- **Yok:** beyin katmanlarının hiçbiri henüz yazılmadı.
- **Sıradaki adımlar:** gözlem katmanı ve biyom hatasının düzeltilmesi, sonra tehlike
  tarayıcısı ve ilk beceri (odun toplama).
