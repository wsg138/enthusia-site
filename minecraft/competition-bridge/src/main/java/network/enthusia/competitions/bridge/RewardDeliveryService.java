package network.enthusia.competitions.bridge;

import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

final class RewardDeliveryService {
    private static final long MAX_AMOUNT = 9_000_000_000_000_000L;

    private final Plugin plugin;
    private final BridgeRepository repository;
    private final VaultIntegration vault;
    private final LoreItemsIntegration loreItems;

    RewardDeliveryService(Plugin plugin, BridgeRepository repository) {
        this.plugin = plugin;
        this.repository = repository;
        this.vault = new VaultIntegration(plugin);
        this.loreItems = new LoreItemsIntegration(plugin);
    }

    JsonObject deliver(BridgeConfig config, JsonObject request, byte[] exactBody) throws Exception {
        RewardRequest reward = rewardRequest(config, request);
        String requestHash = sha256Hex(exactBody);
        BridgeRepository.RewardClaim claim = repository.claimReward(
                reward.operationKey(), reward.rewardType(), reward.recipient(), requestHash, System.currentTimeMillis());
        JsonObject resolvedClaim = resolveClaim(claim, reward.operationKey(), reward.rewardType());
        if (resolvedClaim != null) return resolvedClaim;
        return deliverReward(config, reward);
    }

    private RewardRequest rewardRequest(BridgeConfig config, JsonObject request) throws Exception {
        if (!request.has("schemaVersion") || request.get("schemaVersion").getAsInt() != 1) {
            throw new BridgeRequestException(400, "unsupported_reward_schema", "schemaVersion must be 1");
        }
        String operationKey = text(request, "operationKey", 240);
        UUID recipient = uuid(request, "recipientUuid");
        String rewardType = text(request, "rewardType", 32).toUpperCase(Locale.ROOT);
        JsonObject payload = object(request, "payload");
        validatePayload(config, rewardType, payload);
        return new RewardRequest(operationKey, recipient, rewardType, payload);
    }

    private JsonObject resolveClaim(BridgeRepository.RewardClaim claim, String operationKey, String rewardType) throws BridgeRequestException {
        return switch (claim.state()) {
            case CLAIMED -> null;
            case OPERATION_CONFLICT -> throw new BridgeRequestException(
                    409, "operation_key_conflict", "operationKey already belongs to a different reward request");
            case ALREADY_DELIVERED -> idempotentReplay(operationKey);
            case RECONCILIATION_REQUIRED -> retryableReward(rewardType)
                    ? null
                    : response("REVIEW_REQUIRED", operationKey,
                            "A previous attempt crossed or may have crossed the side-effect boundary. Automatic retry is blocked.");
        };
    }

    private JsonObject deliverReward(BridgeConfig config, RewardRequest reward) throws Exception {
        return switch (reward.rewardType()) {
            case "MONEY" -> money(config, reward.operationKey(), reward.recipient(), reward.payload());
            case "ITEM" -> item(config, reward.operationKey(), reward.recipient(), reward.payload());
            case "LORE_ITEM" -> lore(config, reward.operationKey(), reward.recipient(), reward.payload());
            case "PERMISSION" -> permission(config, reward.operationKey(), reward.recipient(), reward.payload());
            case "RANK" -> rank(config, reward.operationKey(), reward.recipient(), reward.payload());
            case "COMMAND" -> rawCommand(config, reward.operationKey(), reward.recipient(), reward.payload());
            default -> throw new BridgeRequestException(400, "unsupported_reward_type", "Unsupported reward type");
        };
    }

    private static JsonObject idempotentReplay(String operationKey) {
        JsonObject result = response("ALREADY_DELIVERED", operationKey, "The logical reward was already accepted or delivered");
        result.addProperty("idempotentReplay", true);
        return result;
    }

    private static boolean retryableReward(String rewardType) {
        return rewardType.equals("LORE_ITEM") || rewardType.equals("ITEM");
    }

    private JsonObject money(BridgeConfig config, String key, UUID recipient, JsonObject payload) throws Exception {
        long amount = longValue(payload, "amount", 0, MAX_AMOUNT);
        try {
            vault.deposit(config, recipient, amount);
            return delivered(key, "Vault deposit completed");
        } catch (Exception exception) {
            return uncertain(key, "Vault outcome could not be proven: " + safe(exception));
        }
    }

    private JsonObject item(BridgeConfig config, String key, UUID recipient, JsonObject payload) throws Exception {
        String itemKey = text(payload, "itemKey", 160);
        int amount = (int) longValue(payload, "amount", 1, 2304);
        Material material = MainThreadBridge.call(plugin, config.server().mainThreadTimeoutMs(), () -> Material.matchMaterial(itemKey));
        if (material == null || !material.isItem() || material.isAir()) {
            throw new BridgeRequestException(400, "unknown_item", "Item key does not resolve to a vanilla item");
        }
        JsonObject accepted = response("ACCEPTED", key, "Item reward is durably queued for inventory delivery");
        accepted.addProperty("material", material.getKey().toString());
        accepted.addProperty("amount", amount);
        repository.acceptQueuedItem(key, recipient, material.getKey().toString(), amount, accepted, System.currentTimeMillis());
        Bukkit.getScheduler().runTask(plugin, () -> attemptPendingItems(recipient));
        return accepted;
    }

    private JsonObject lore(BridgeConfig config, String key, UUID recipient, JsonObject payload) throws Exception {
        String definitionKey = text(payload, "itemKey", 160);
        try {
            LoreItemsIntegration.Result result = loreItems.queue(config, definitionKey, recipient, key);
            return switch (result.status()) {
                case "ACCEPTED_QUEUED", "ALREADY_ACCEPTED" -> deliveredWithStatus(key, "ACCEPTED", result.detail());
                case "UNKNOWN_DEFINITION", "VALIDATION_FAILURE", "SERVICE_UNAVAILABLE" -> uncertain(key, result.status() + ": " + result.detail());
                default -> uncertain(key, "Unexpected LoreItems response: " + result.status());
            };
        } catch (Exception exception) {
            return uncertain(key, "LoreItems outcome could not be proven: " + safe(exception));
        }
    }

    private JsonObject permission(BridgeConfig config, String key, UUID recipient, JsonObject payload) throws Exception {
        String permission = identifier(payload, "permission", 160);
        Long durationMinutes = optionalPositive(payload, "durationMinutes", 5_256_000L);
        long durationSeconds = durationMinutes == null ? 0 : Math.multiplyExact(durationMinutes, 60L);
        String template = durationMinutes == null
                ? config.rewards().permissions().permanentCommand()
                : config.rewards().permissions().temporaryCommand();
        return configuredCommand(config, key, recipient, template, Map.of(
                "{permission}", permission,
                "{durationSeconds}", Long.toString(durationSeconds)
        ));
    }

    private JsonObject rank(BridgeConfig config, String key, UUID recipient, JsonObject payload) throws Exception {
        String rank = identifier(payload, "rank", 96);
        Long durationMinutes = optionalPositive(payload, "durationMinutes", 5_256_000L);
        long durationSeconds = durationMinutes == null ? 0 : Math.multiplyExact(durationMinutes, 60L);
        String template = durationMinutes == null
                ? config.rewards().ranks().permanentCommand()
                : config.rewards().ranks().temporaryCommand();
        return configuredCommand(config, key, recipient, template, Map.of(
                "{rank}", rank,
                "{durationSeconds}", Long.toString(durationSeconds)
        ));
    }

    private JsonObject rawCommand(BridgeConfig config, String key, UUID recipient, JsonObject payload) throws Exception {
        String command = text(payload, "command", 500);
        if (!config.rewards().commandPolicy().enabled()) {
            throw new BridgeRequestException(409, "command_rewards_disabled", "Raw command rewards are disabled in bridge config");
        }
        String normalized = stripSlash(command);
        String lower = normalized.toLowerCase(Locale.ROOT);
        if (config.rewards().commandPolicy().allowedPrefixes().stream().noneMatch(lower::startsWith)) {
            throw new BridgeRequestException(403, "command_not_allowed", "Command does not match an allowed prefix");
        }
        return configuredCommand(config, key, recipient, normalized, Map.of());
    }

    private JsonObject configuredCommand(BridgeConfig config, String key, UUID recipient, String template, Map<String, String> replacements) throws Exception {
        String name = MainThreadBridge.call(plugin, config.server().mainThreadTimeoutMs(), () -> {
            OfflinePlayer player = Bukkit.getOfflinePlayer(recipient);
            return player.getName() == null ? recipient.toString() : player.getName();
        });
        String command = template.replace("{player}", name).replace("{uuid}", recipient.toString());
        for (Map.Entry<String, String> replacement : replacements.entrySet()) {
            command = command.replace(replacement.getKey(), replacement.getValue());
        }
        command = stripSlash(command);
        if (command.length() > 500 || command.indexOf('\n') >= 0 || command.indexOf('\r') >= 0) {
            throw new BridgeRequestException(400, "invalid_expanded_command", "Expanded reward command is invalid");
        }
        final String toRun = command;
        try {
            boolean accepted = MainThreadBridge.call(plugin, config.server().mainThreadTimeoutMs(),
                    () -> Bukkit.dispatchCommand(Bukkit.getConsoleSender(), toRun));
            if (!accepted) return uncertain(key, "Server command map did not confirm successful command handling");
            return delivered(key, "Configured server reward command completed");
        } catch (Exception exception) {
            return uncertain(key, "Command outcome could not be proven: " + safe(exception));
        }
    }

    void attemptPendingItems(UUID playerUuid) {
        Player player = Bukkit.getPlayer(playerUuid);
        if (player == null || !player.isOnline()) return;
        try {
            for (BridgeRepository.PendingItem pending : repository.pendingItems(playerUuid)) {
                attemptPendingItem(player, pending);
            }
        } catch (Exception exception) {
            plugin.getLogger().warning("Unable to process queued competition items for " + playerUuid + ": " + safe(exception));
        }
    }

    private void attemptPendingItem(Player player, BridgeRepository.PendingItem pending) throws Exception {
        Material material = Material.matchMaterial(pending.materialKey());
        if (material == null || !material.isItem() || material.isAir()) return;
        int remaining = insertIntoInventory(player, material, pending.remaining());
        repository.updatePendingItem(pending.operationKey(), remaining, System.currentTimeMillis());
    }

    private static int insertIntoInventory(Player player, Material material, int remaining) {
        while (remaining > 0) {
            int stackAmount = Math.min(remaining, material.getMaxStackSize());
            Map<Integer, ItemStack> leftovers = player.getInventory().addItem(new ItemStack(material, stackAmount));
            int leftover = leftovers.values().stream().mapToInt(ItemStack::getAmount).sum();
            int inserted = stackAmount - leftover;
            remaining -= inserted;
            if (inserted <= 0 || leftover > 0) break;
        }
        return remaining;
    }

    private void validatePayload(BridgeConfig config, String type, JsonObject payload) throws Exception {
        switch (type) {
            case "MONEY" -> longValue(payload, "amount", 0, MAX_AMOUNT);
            case "ITEM" -> validateItemPayload(config, payload);
            case "LORE_ITEM" -> text(payload, "itemKey", 160);
            case "PERMISSION" -> validateTimedIdentifier(payload, "permission", 160);
            case "RANK" -> validateTimedIdentifier(payload, "rank", 96);
            case "COMMAND" -> validateCommandPayload(payload);
            default -> throw new BridgeRequestException(400, "unsupported_reward_type", "Unsupported reward type");
        }
    }

    private void validateItemPayload(BridgeConfig config, JsonObject payload) throws Exception {
        String item = text(payload, "itemKey", 160);
        longValue(payload, "amount", 1, 2304);
        Material material = MainThreadBridge.call(
                plugin, config.server().mainThreadTimeoutMs(), () -> Material.matchMaterial(item));
        if (material == null || !material.isItem() || material.isAir()) {
            throw new BridgeRequestException(400, "unknown_item", "Unknown vanilla item");
        }
    }

    private static void validateTimedIdentifier(JsonObject payload, String key, int max) throws BridgeRequestException {
        identifier(payload, key, max);
        optionalPositive(payload, "durationMinutes", 5_256_000L);
    }

    private static void validateCommandPayload(JsonObject payload) throws BridgeRequestException {
        String command = text(payload, "command", 500);
        if (command.indexOf('\n') >= 0 || command.indexOf('\r') >= 0) {
            throw new BridgeRequestException(400, "invalid_command", "Command contains a newline");
        }
    }

    private JsonObject delivered(String key, String message) throws Exception {
        return deliveredWithStatus(key, "DELIVERED", message);
    }

    private JsonObject deliveredWithStatus(String key, String status, String message) throws Exception {
        JsonObject result = response(status, key, message);
        repository.markRewardDelivered(key, result, System.currentTimeMillis());
        return result;
    }

    private JsonObject uncertain(String key, String message) throws Exception {
        JsonObject result = response("REVIEW_REQUIRED", key, message);
        repository.markRewardReconciliationRequired(key, result, System.currentTimeMillis());
        return result;
    }

    private static JsonObject response(String status, String key, String message) {
        JsonObject result = new JsonObject();
        result.addProperty("status", status);
        result.addProperty("operationKey", key);
        result.addProperty("message", message);
        return result;
    }

    static String sha256Hex(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private static String stripSlash(String value) { return value.startsWith("/") ? value.substring(1) : value; }

    private static String text(JsonObject object, String key, int max) throws BridgeRequestException {
        try {
            String value = object.get(key).getAsString().trim();
            if (value.isEmpty() || value.length() > max) throw new IllegalArgumentException();
            return value;
        } catch (Exception exception) {
            throw new BridgeRequestException(400, "invalid_reward_request", key + " is invalid");
        }
    }

    private static String identifier(JsonObject object, String key, int max) throws BridgeRequestException {
        String value = text(object, key, max);
        if (!value.matches("[A-Za-z0-9._:-]+")) throw new BridgeRequestException(400, "invalid_reward_request", key + " contains unsupported characters");
        return value;
    }

    private static UUID uuid(JsonObject object, String key) throws BridgeRequestException {
        try { return UUID.fromString(text(object, key, 36)); }
        catch (IllegalArgumentException exception) { throw new BridgeRequestException(400, "invalid_reward_request", key + " must be a UUID"); }
    }

    private static JsonObject object(JsonObject object, String key) throws BridgeRequestException {
        try { return object.getAsJsonObject(key); }
        catch (Exception exception) { throw new BridgeRequestException(400, "invalid_reward_request", key + " must be an object"); }
    }

    private static long longValue(JsonObject object, String key, long min, long max) throws BridgeRequestException {
        try {
            long value = object.get(key).getAsLong();
            if (value < min || value > max) throw new IllegalArgumentException();
            return value;
        } catch (Exception exception) {
            throw new BridgeRequestException(400, "invalid_reward_request", key + " is outside the allowed range");
        }
    }

    private static Long optionalPositive(JsonObject object, String key, long max) throws BridgeRequestException {
        if (!object.has(key) || object.get(key).isJsonNull()) return null;
        return longValue(object, key, 1, max);
    }

    private static String safe(Exception exception) {
        String value = exception.getMessage();
        if (value == null || value.isBlank()) value = exception.getClass().getSimpleName();
        return value.length() > 300 ? value.substring(0, 300) : value;
    }

    private record RewardRequest(String operationKey, UUID recipient, String rewardType, JsonObject payload) {}
}
