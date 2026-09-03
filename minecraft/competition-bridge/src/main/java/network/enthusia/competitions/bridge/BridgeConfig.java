package network.enthusia.competitions.bridge;

import org.bukkit.configuration.file.FileConfiguration;

import java.net.InetAddress;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

public record BridgeConfig(
        Server server,
        Security security,
        Integrations integrations,
        Staff staff,
        Notifications notifications,
        Rewards rewards,
        Logging logging
) {
    public static BridgeConfig load(CompetitionBridgePlugin plugin) {
        Objects.requireNonNull(plugin, "plugin");
        plugin.reloadConfig();
        return from(
                plugin.getConfig(),
                System.getenv("ENTHUSIA_COMPETITION_BRIDGE_BEARER_TOKEN"),
                System.getenv("ENTHUSIA_COMPETITION_BRIDGE_HMAC_SECRET")
        );
    }

    static BridgeConfig from(FileConfiguration config, String environmentBearer, String environmentHmac) {
        Objects.requireNonNull(config, "config");
        boolean enabled = config.getBoolean("server.enabled", false);
        return new BridgeConfig(
                loadServer(config, enabled),
                loadSecurity(config, enabled, environmentBearer, environmentHmac),
                loadIntegrations(config),
                new Staff(requireIdentifier(
                        config.getString("staff.review-permission", "enthusia.competitions.review"),
                        "staff.review-permission"
                )),
                loadNotifications(config),
                loadRewards(config),
                new Logging(
                        config.getBoolean("logging.log-successful-requests", false),
                        config.getBoolean("logging.log-rejected-requests", true)
                )
        );
    }

    private static Security loadSecurity(
            FileConfiguration config,
            boolean enabled,
            String environmentBearer,
            String environmentHmac
    ) {
        String bearer = firstNonBlank(environmentBearer, config.getString("security.bearer-token", ""));
        String hmac = firstNonBlank(environmentHmac, config.getString("security.hmac-secret", ""));
        if (enabled && (bearer.length() < 32 || hmac.length() < 32)) {
            throw new IllegalArgumentException("Enabled bridge requires bearer token and HMAC secret of at least 32 characters each");
        }
        if (enabled && bearer.equals(hmac)) throw new IllegalArgumentException("Bridge bearer token and HMAC secret must be different values");
        int clockSkew = bounded(config.getInt("security.max-clock-skew-seconds", 90), 5, 600, "security.max-clock-skew-seconds");
        int nonceRetention = bounded(config.getInt("security.nonce-retention-seconds", 300), clockSkew, 3600, "security.nonce-retention-seconds");
        return new Security(bearer, hmac, clockSkew, nonceRetention);
    }

    private static Server loadServer(FileConfiguration config, boolean enabled) {
        String bindHost = requireText(config.getString("server.bind-host", "127.0.0.1"), "server.bind-host", 255);
        boolean allowNonLoopback = config.getBoolean("server.allow-non-loopback-bind", false);
        if (enabled && !allowNonLoopback) requireLoopback(bindHost);
        int port = bounded(config.getInt("server.port", 8765), 1, 65535, "server.port");
        int workerThreads = bounded(config.getInt("server.worker-threads", 4), 1, 32, "server.worker-threads");
        int maxRequestBytes = bounded(config.getInt("server.max-request-bytes", 65536), 4096, 1_048_576, "server.max-request-bytes");
        int mainThreadTimeoutMs = bounded(config.getInt("server.main-thread-timeout-ms", 4000), 250, 30_000, "server.main-thread-timeout-ms");
        return new Server(enabled, bindHost, allowNonLoopback, port, workerThreads, maxRequestBytes, mainThreadTimeoutMs);
    }

    private static void requireLoopback(String bindHost) {
        try {
            if (!InetAddress.getByName(bindHost).isLoopbackAddress()) {
                throw new IllegalArgumentException("server.bind-host must be loopback unless server.allow-non-loopback-bind is explicitly enabled");
            }
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("server.bind-host is invalid", exception);
        }
    }

    private static Integrations loadIntegrations(FileConfiguration config) {
        String playtimePlugin = requireText(config.getString("integrations.playtime-plugin", "EnthusiaPlaytime"), "integrations.playtime-plugin", 64);
        String guildsPlugin = requireText(config.getString("integrations.guilds-plugin", "LumaGuilds"), "integrations.guilds-plugin", 64);
        String loreItemsPlugin = requireText(config.getString("integrations.lore-items-plugin", "EnthusiaLoreItems"), "integrations.lore-items-plugin", 64);
        String websiteGuildPermission = requireIdentifier(config.getString("integrations.website-guild-submit-permission", "competition.submit"), "integrations.website-guild-submit-permission");
        String lumaGuildPermission = requireIdentifier(config.getString("integrations.lumaguilds-submit-permission", "SUBMIT_COMPETITION_ENTRIES"), "integrations.lumaguilds-submit-permission").toUpperCase(Locale.ROOT);
        return new Integrations(playtimePlugin, guildsPlugin, loreItemsPlugin, websiteGuildPermission, lumaGuildPermission);
    }

    private static Notifications loadNotifications(FileConfiguration config) {
        String staffPrefix = config.getString("notifications.staff-prefix", "&6[Competitions]&r ");
        String contributorPrefix = config.getString("notifications.contributor-prefix", "&d[Competition Invite]&r ");
        return new Notifications(
                config.getBoolean("notifications.contributor-login-reminders", true),
                staffPrefix == null ? "" : staffPrefix,
                contributorPrefix == null ? "" : contributorPrefix
        );
    }

    private static Rewards loadRewards(FileConfiguration config) {
        List<String> allowedPrefixes = config.getStringList("rewards.commands.allowed-prefixes").stream()
                .map(String::trim).filter(value -> !value.isEmpty()).map(value -> value.toLowerCase(Locale.ROOT)).distinct().toList();
        String fallbackCommand = config.getString("rewards.lore-items.fallback-command", "");
        return new Rewards(
                new CommandPolicy(config.getBoolean("rewards.commands.enabled", false), allowedPrefixes),
                new PermissionCommands(
                        requireText(config.getString("rewards.permissions.permanent-command", "lp user {player} permission set {permission} true"), "rewards.permissions.permanent-command", 500),
                        requireText(config.getString("rewards.permissions.temporary-command", "lp user {player} permission settemp {permission} true {durationSeconds}s"), "rewards.permissions.temporary-command", 500)
                ),
                new RankCommands(
                        requireText(config.getString("rewards.ranks.permanent-command", "lp user {player} parent add {rank}"), "rewards.ranks.permanent-command", 500),
                        requireText(config.getString("rewards.ranks.temporary-command", "lp user {player} parent addtemp {rank} {durationSeconds}s"), "rewards.ranks.temporary-command", 500)
                ),
                fallbackCommand == null ? "" : fallbackCommand.trim(),
                bounded(config.getInt("rewards.items.retry-seconds", 60), 5, 3600, "rewards.items.retry-seconds")
        );
    }

    private static String firstNonBlank(String first, String second) {
        if (first != null && !first.isBlank()) return first.trim();
        return second == null ? "" : second.trim();
    }

    private static int bounded(int value, int min, int max, String path) {
        if (value < min || value > max) throw new IllegalArgumentException(path + " must be between " + min + " and " + max);
        return value;
    }

    private static String requireText(String value, String path, int max) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty() || normalized.length() > max) throw new IllegalArgumentException(path + " is missing or too long");
        return normalized;
    }

    private static String requireIdentifier(String value, String path) {
        String normalized = requireText(value, path, 128);
        if (!normalized.matches("[A-Za-z0-9._:-]+")) throw new IllegalArgumentException(path + " contains unsupported characters");
        return normalized;
    }

    public record Server(boolean enabled, String bindHost, boolean allowNonLoopbackBind, int port, int workerThreads, int maxRequestBytes, int mainThreadTimeoutMs) {}
    public record Security(String bearerToken, String hmacSecret, int maxClockSkewSeconds, int nonceRetentionSeconds) {}
    public record Integrations(String playtimePlugin, String guildsPlugin, String loreItemsPlugin, String websiteGuildSubmitPermission, String lumaGuildsSubmitPermission) {}
    public record Staff(String reviewPermission) {}
    public record Notifications(boolean contributorLoginReminders, String staffPrefix, String contributorPrefix) {}
    public record Rewards(CommandPolicy commandPolicy, PermissionCommands permissions, RankCommands ranks, String loreItemFallbackCommand, int itemRetrySeconds) {}
    public record CommandPolicy(boolean enabled, List<String> allowedPrefixes) {}
    public record PermissionCommands(String permanentCommand, String temporaryCommand) {}
    public record RankCommands(String permanentCommand, String temporaryCommand) {}
    public record Logging(boolean successfulRequests, boolean rejectedRequests) {}
}
