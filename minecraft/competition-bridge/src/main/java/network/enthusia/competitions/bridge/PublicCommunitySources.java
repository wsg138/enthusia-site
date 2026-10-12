package network.enthusia.competitions.bridge;

import java.lang.reflect.Method;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;

/** Optional public provider API adapters. Never traverse fields or write provider state. */
final class PublicCommunitySources {
    private final Plugin bridge;
    PublicCommunitySources(Plugin bridge) { this.bridge = bridge; }

    Map<String, Object> read(String kind) throws Exception {
        return MainThreadBridge.call(bridge, 4000, () -> switch (kind) {
            case "bounties" -> bounties();
            case "achievements" -> achievements();
            default -> throw new IllegalArgumentException("Unsupported community source");
        });
    }
    private Map<String, Object> bounties() throws Exception {
        if (!"RAW_GOLD".equals(bridge.getConfig().getString("community-feeds.bounty-currency"))) {
            throw new IllegalStateException("Bounty currency is unverified");
        }
        Plugin provider = enabled("NotBounties");
        Class<?> manager = Class.forName("me.jadenp.notbounties.utils.DataManager", true, provider.getClass().getClassLoader());
        Object all = manager.getMethod("getAllBounties", int.class).invoke(null, -1);
        return projectBounties(collection(all), Instant.now());
    }
    private Map<String, Object> achievements() throws Exception {
        Plugin provider = enabled("EnthusiaAdvancements");
        Object snapshot = provider.getClass().getMethod("websiteAchievements").invoke(provider);
        if (!(snapshot instanceof Map<?, ?> map)) throw new IllegalStateException("Invalid achievement provider");
        return projectAchievements(map);
    }
    private static Plugin enabled(String name) {
        Plugin plugin = Bukkit.getPluginManager().getPlugin(name);
        if (plugin == null || !plugin.isEnabled()) throw new IllegalStateException("Public provider unavailable");
        return plugin;
    }
    static Map<String, Object> projectBounties(Collection<?> bounties, Instant now) throws Exception {
        if (bounties.size() > 1000) throw new IllegalArgumentException("Bounty limit exceeded");
        List<Map<String, Object>> items = new ArrayList<>();
        int settersRead = 0;
        for (Object bounty : bounties) {
            double gold = 0;
            for (Object setter : collection(invoke(bounty, "getSetters"))) {
                if (++settersRead > 10000) throw new IllegalArgumentException("Setter limit exceeded");
                // Both allowlists and denylists are restricted. Omit all such contributions.
                Object whitelist = invoke(setter, "getWhitelist");
                if (!collection(invoke(whitelist, "getList")).isEmpty()
                        || !collection(invoke(setter, "getItems")).isEmpty()) continue;
                Object amount = invoke(setter, "getAmount");
                if (!(amount instanceof Number number) || !Double.isFinite(number.doubleValue())
                        || number.doubleValue() < 0) throw new IllegalArgumentException("Invalid cash bounty");
                gold += number.doubleValue();
            }
            if (!Double.isFinite(gold) || gold > 1e12) throw new IllegalArgumentException("Invalid bounty total");
            if (gold == 0) continue;
            Object identity = invoke(bounty, "getUUID");
            if (!(identity instanceof UUID uuid)) throw new IllegalArgumentException("Invalid bounty UUID");
            String name = publicText(invoke(bounty, "getName"), 80);
            items.add(Map.of("id", uuid.toString(), "name", name, "gold", gold, "state", "open",
                "description", "Public cash bounty. Restricted and item rewards are excluded."));
        }
        return Map.of("schemaVersion", 1, "generatedAt", now.toString(), "limited", true,
            "source", "server_export", "items", items);
    }
    static Map<String, Object> projectAchievements(Map<?, ?> snapshot) {
        Instant timestamp = Instant.parse(publicText(snapshot.get("generatedAt"), 64));
        Collection<?> rows = collection(snapshot.get("items"));
        if (rows.size() > 1000) throw new IllegalArgumentException("Achievement limit exceeded");
        List<Map<String, Object>> items = new ArrayList<>();
        for (Object value : rows) {
            if (!(value instanceof Map<?, ?> row)) throw new IllegalArgumentException("Invalid achievement");
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", publicText(row.get("id"), 80));
            item.put("name", publicText(row.get("name"), 80));
            item.put("description", optionalText(row.get("description"), 2000));
            item.put("category", optionalText(row.get("category"), 80));
            item.put("icon", optionalText(row.get("icon"), 80));
            // Renderer doesn't own provider rewards or completion statistics.
            item.put("reward", "");
            item.put("completed", null);
            items.add(item);
        }
        return Map.of("schemaVersion", 1, "generatedAt", timestamp.toString(), "limited", true,
            "source", "server_export", "items", items);
    }
    private static Object invoke(Object target, String name) throws Exception {
        Method method = target.getClass().getMethod(name);
        return method.invoke(target);
    }
    private static Collection<?> collection(Object value) {
        if (!(value instanceof Collection<?> items)) throw new IllegalArgumentException("Collection required");
        return items;
    }
    private static String optionalText(Object value, int max) { return value == null || "".equals(value) ? "" : publicText(value, max); }
    private static String publicText(Object value, int max) {
        if (!(value instanceof String text) || text.isBlank() || text.length() > max) throw new IllegalArgumentException("Invalid public text");
        return text;
    }
}
