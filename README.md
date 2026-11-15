# TabHide

Paper/Purpur **1.21.11** için oyuncu gizleme eklentisi.

## Özellikler
- `/gizle` veya `/vanish`: Kendini gizler/gösterir.
- `/gizle <oyuncu>`: Yetkili oyuncuyu gizler/gösterir.
- Gizlenen oyuncu diğer oyuncuların TAB listesinden ve dünyasından kaldırılır.
- Gizli oyuncu sunucu listesinin (Minecraft sunucu ekranındaki çevrimiçi oyuncu sayısı) sayacına dahil edilmez.
- Gizli oyuncunun normal sohbet mesajları engellenir.
- Görünürlük iksiri kullanılmaz; bu nedenle iksir parçacığı oluşturulmaz.
- Gizlilik UUID ile kaydedilir ve yeniden girişte uygulanır.

> Not: Bu eklenti Minecraft sunucu listesindeki ping sayısını değiştirir. Bukkit/Paper API'sindeki `Bukkit.getOnlinePlayers()` sonucunu veya üçüncü taraf eklentilerin kendi sayaçlarını değiştirmez. Sohbet engeli normal oyuncu sohbetini kapsar; komut kullanımını engellemez.

## Yetkiler
- `tabhide.use` — kendini gizle/göster (varsayılan: op)
- `tabhide.others` — başka oyuncuları gizle/göster (varsayılan: op)

## Derleme
Java 21 ve Maven ile:
```bash
mvn package
```
JAR: `target/tabhide-1.0.0.jar`

Derlenen JAR'ı sunucunun `plugins` klasörüne koyup sunucuyu yeniden başlat.
