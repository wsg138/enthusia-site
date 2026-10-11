package network.enthusia.competitions.bridge;

import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.ServicesManager;

import java.util.UUID;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.TimeUnit;

final class LoreItemsIntegration {
    record Result(String status, String detail) {}

    private final Plugin owner;

    LoreItemsIntegration(Plugin owner) {
        this.owner = owner;
    }

    Result queue(BridgeConfig config, String definitionKey, UUID playerUuid, String operationKey) throws Exception {
        Object service = MainThreadBridge.call(owner, config.server().mainThreadTimeoutMs(), () -> service(config));
        if (service == null) throw new IllegalStateException("EnthusiaLoreItems service is unavailable");
        Object stageValue = service.getClass()
                .getMethod("queueDelivery", String.class, UUID.class, String.class)
                .invoke(service, definitionKey, playerUuid, operationKey);
        if (!(stageValue instanceof CompletionStage<?> stage)) {
            throw new IllegalStateException("EnthusiaLoreItems returned an invalid delivery stage");
        }
        Object result = stage.toCompletableFuture().get(config.server().mainThreadTimeoutMs(), TimeUnit.MILLISECONDS);
        String status = String.valueOf(result.getClass().getMethod("status").invoke(result));
        String detail = String.valueOf(result.getClass().getMethod("detail").invoke(result));
        return new Result(status, detail);
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private Object service(BridgeConfig config) throws Exception {
        Plugin plugin = Bukkit.getPluginManager().getPlugin(config.integrations().loreItemsPlugin());
        if (plugin == null || !plugin.isEnabled()) return null;
        Class api = Class.forName(
                "net.enthusia.loreitems.api.v1.LoreItemsServiceV1",
                true,
                plugin.getClass().getClassLoader()
        );
        ServicesManager services = Bukkit.getServicesManager();
        return services.load(api);
    }
}
