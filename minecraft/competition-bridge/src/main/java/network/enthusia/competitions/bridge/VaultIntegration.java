package network.enthusia.competitions.bridge;

import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.ServicesManager;

import java.util.UUID;

final class VaultIntegration {
    private final Plugin owner;

    VaultIntegration(Plugin owner) {
        this.owner = owner;
    }

    void deposit(BridgeConfig config, UUID playerUuid, long amount) throws Exception {
        if (amount < 0) throw new IllegalArgumentException("Money amount cannot be negative");
        MainThreadBridge.call(owner, config.server().mainThreadTimeoutMs(), () -> {
            Plugin vault = Bukkit.getPluginManager().getPlugin("Vault");
            if (vault == null || !vault.isEnabled()) throw new IllegalStateException("Vault is unavailable");
            @SuppressWarnings("rawtypes")
            Class economyClass = Class.forName("net.milkbowl.vault.economy.Economy", true, vault.getClass().getClassLoader());
            ServicesManager services = Bukkit.getServicesManager();
            @SuppressWarnings("unchecked")
            Object economy = services.load(economyClass);
            if (economy == null) throw new IllegalStateException("Vault economy provider is unavailable");
            OfflinePlayer player = Bukkit.getOfflinePlayer(playerUuid);
            Object response = economy.getClass()
                    .getMethod("depositPlayer", OfflinePlayer.class, double.class)
                    .invoke(economy, player, (double) amount);
            boolean success = Boolean.TRUE.equals(response.getClass().getMethod("transactionSuccess").invoke(response));
            if (!success) {
                Object error = response.getClass().getField("errorMessage").get(response);
                throw new IllegalStateException("Vault deposit failed: " + String.valueOf(error));
            }
            return null;
        });
    }
}
