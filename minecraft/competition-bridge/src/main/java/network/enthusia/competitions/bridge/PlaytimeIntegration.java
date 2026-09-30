package network.enthusia.competitions.bridge;

import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Optional;
import java.util.UUID;

final class PlaytimeIntegration {
    private final Plugin owner;

    PlaytimeIntegration(Plugin owner) {
        this.owner = owner;
    }

    long activeMinutes(BridgeConfig config, UUID playerUuid) throws Exception {
        return MainThreadBridge.call(owner, config.server().mainThreadTimeoutMs(), () -> {
            Plugin plugin = Bukkit.getPluginManager().getPlugin(config.integrations().playtimePlugin());
            if (plugin == null || !plugin.isEnabled()) throw new IllegalStateException("EnthusiaPlaytime is unavailable");
            Object service = plugin.getClass().getMethod("getPlaytimeService").invoke(plugin);
            if (service == null) throw new IllegalStateException("Playtime service is unavailable");
            Method lifetime = service.getClass().getMethod("getLifetime", UUID.class);
            Object raw = lifetime.invoke(service, playerUuid);
            if (!(raw instanceof Optional<?> optional) || optional.isEmpty()) return 0L;
            Object snapshot = optional.get();
            try {
                Field active = snapshot.getClass().getField("activeMinutes");
                return Math.max(0L, active.getLong(snapshot));
            } catch (NoSuchFieldException ignored) {
                Method active = snapshot.getClass().getMethod("activeMinutes");
                return Math.max(0L, ((Number) active.invoke(snapshot)).longValue());
            }
        });
    }
}
