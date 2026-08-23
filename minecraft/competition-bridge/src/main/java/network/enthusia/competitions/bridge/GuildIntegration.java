package network.enthusia.competitions.bridge;

import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.ServicesManager;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;

final class GuildIntegration {
    record GuildView(String id, String name, List<String> permissions) {}

    private final Plugin owner;

    GuildIntegration(Plugin owner) {
        this.owner = owner;
    }

    List<GuildView> guildsFor(BridgeConfig config, UUID playerUuid) throws Exception {
        return MainThreadBridge.call(owner, config.server().mainThreadTimeoutMs(), () -> {
            Object service = service(config);
            if (service == null) return List.of();
            Object rawIds = service.getClass().getMethod("getPlayerGuildIds", UUID.class).invoke(service, playerUuid);
            if (!(rawIds instanceof Collection<?> ids)) return List.of();
            List<GuildView> result = new ArrayList<>();
            for (Object rawId : ids) {
                if (!(rawId instanceof UUID guildId)) continue;
                Object summary = service.getClass().getMethod("getGuild", UUID.class).invoke(service, guildId);
                if (summary == null) continue;
                String name = String.valueOf(summary.getClass().getMethod("getName").invoke(summary));
                boolean allowed = Boolean.TRUE.equals(service.getClass()
                        .getMethod("hasShopPermission", UUID.class, UUID.class, String.class)
                        .invoke(service, playerUuid, guildId, config.integrations().lumaGuildsSubmitPermission()));
                result.add(new GuildView(
                        guildId.toString(),
                        name,
                        allowed ? List.of(config.integrations().websiteGuildSubmitPermission()) : List.of()
                ));
            }
            return List.copyOf(result);
        });
    }

    Set<UUID> members(BridgeConfig config, UUID guildId) throws Exception {
        return MainThreadBridge.call(owner, config.server().mainThreadTimeoutMs(), () -> {
            Object service = service(config);
            if (service == null) throw new IllegalStateException("LumaGuilds is unavailable");
            Object raw = service.getClass().getMethod("getGuildMemberIds", UUID.class).invoke(service, guildId);
            if (!(raw instanceof Collection<?> values)) return Set.of();
            java.util.LinkedHashSet<UUID> result = new java.util.LinkedHashSet<>();
            for (Object value : values) if (value instanceof UUID uuid) result.add(uuid);
            return Set.copyOf(result);
        });
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private Object service(BridgeConfig config) throws Exception {
        Plugin plugin = Bukkit.getPluginManager().getPlugin(config.integrations().guildsPlugin());
        if (plugin == null || !plugin.isEnabled()) return null;
        Class lookup = Class.forName("net.lumalyte.lg.api.GuildLookup", true, plugin.getClass().getClassLoader());
        ServicesManager services = Bukkit.getServicesManager();
        return services.load(lookup);
    }
}
