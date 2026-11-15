package com.ytbentr.tabhide;

import io.papermc.paper.event.player.AsyncChatEvent;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import com.destroystokyo.paper.event.server.PaperServerListPingEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class TabHidePlugin extends JavaPlugin implements Listener {
    private final Set<UUID> vanished = ConcurrentHashMap.newKeySet();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        for (String id : getConfig().getStringList("vanished")) {
            try { vanished.add(UUID.fromString(id)); }
            catch (IllegalArgumentException ignored) { getLogger().warning("Gecersiz UUID: " + id); }
        }
        Bukkit.getPluginManager().registerEvents(this, this);
        for (Player player : Bukkit.getOnlinePlayers()) {
            if (vanished.contains(player.getUniqueId())) applyVanish(player);
        }
        getLogger().info("TabHide etkin. Gizli oyuncu sayisi: " + vanished.size());
    }

    @Override
    public void onDisable() {
        for (Player player : Bukkit.getOnlinePlayers()) {
            if (vanished.contains(player.getUniqueId())) removeVanish(player);
        }
        saveVanished();
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player joining = event.getPlayer();
        // Yeni giren oyuncuya daha once gizlenmis herkesi gosterme.
        for (UUID id : vanished) {
            Player hidden = Bukkit.getPlayer(id);
            if (hidden != null && !hidden.equals(joining)) joining.hidePlayer(this, hidden);
        }
        if (vanished.contains(joining.getUniqueId())) applyVanish(joining);
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        // UUID kaydi korunur; oyuncu tekrar girdiginde gizlilik yeniden uygulanir.
    }

    private void applyVanish(Player target) {
        for (Player viewer : Bukkit.getOnlinePlayers()) {
            if (!viewer.equals(target)) viewer.hidePlayer(this, target);
        }
    }

    private void removeVanish(Player target) {
        for (Player viewer : Bukkit.getOnlinePlayers()) {
            if (!viewer.equals(target)) viewer.showPlayer(this, target);
        }
    }

    private void saveVanished() {
        getConfig().set("vanished", vanished.stream().map(UUID::toString).toList());
        saveConfig();
    }

    private boolean toggle(Player target) {
        UUID id = target.getUniqueId();
        if (vanished.remove(id)) {
            removeVanish(target);
            saveVanished();
            return false;
        }
        vanished.add(id);
        applyVanish(target);
        saveVanished();
        return true;
    }

    @EventHandler
    public void onChat(AsyncChatEvent event) {
        if (vanished.contains(event.getPlayer().getUniqueId())) event.setCancelled(true);
    }

    @EventHandler
    public void onServerListPing(PaperServerListPingEvent event) {
        long hiddenOnline = Bukkit.getOnlinePlayers().stream()
                .filter(player -> vanished.contains(player.getUniqueId())).count();
        event.setNumPlayers(Math.max(0, event.getNumPlayers() - (int) hiddenOnline));
        // Sunucu listesinde fareyle oyuncu sayisinin uzerine gelince gizli oyuncular da gorunmesin.
        event.getListedPlayers().removeIf(info -> vanished.contains(info.id()));
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage("Konsol kullanim: /gizle <oyuncu>");
                return true;
            }
            if (!sender.hasPermission("tabhide.use")) {
                sender.sendMessage("§cBu komut icin yetkin yok.");
                return true;
            }
            boolean hidden = toggle(player);
            sender.sendMessage(hidden ? "§aArtik gizlisin. Tab listesinden ve oyuncu sayacindan kaldirildin; sohbet mesajlarin engellendi."
                    : "§eGorunurlugun geri acildi.");
            return true;
        }

        if (!sender.hasPermission("tabhide.others")) {
            sender.sendMessage("§cBaska oyunculari gizlemek icin yetkin yok.");
            return true;
        }
        Player target = Bukkit.getPlayerExact(args[0]);
        if (target == null) {
            sender.sendMessage("§cOyuncu bulunamadi veya cevrimdisi.");
            return true;
        }
        boolean hidden = toggle(target);
        sender.sendMessage(hidden ? "§a" + target.getName() + " artik gizli."
                : "§e" + target.getName() + " artik gorunur.");
        if (sender != target) target.sendMessage(hidden ? "§eBir yetkili seni gizledi." : "§aGorunurlugun geri acildi.");
        return true;
    }
}
