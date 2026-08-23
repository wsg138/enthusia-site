package network.enthusia.competitions.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class BridgeHttpServer implements AutoCloseable {
    private final Plugin plugin;
    private final BridgeConfig config;
    private final BridgeRepository repository;
    private final RewardDeliveryService rewards;
    private final RequestAuthenticator authenticator;
    private final PlaytimeIntegration playtime;
    private final GuildIntegration guilds;
    private final HttpServer server;
    private final ExecutorService executor;

    BridgeHttpServer(Plugin plugin, BridgeConfig config, BridgeRepository repository, RewardDeliveryService rewards) throws IOException {
        this.plugin = plugin;
        this.config = config;
        this.repository = repository;
        this.rewards = rewards;
        this.authenticator = new RequestAuthenticator(config.security(), repository);
        this.playtime = new PlaytimeIntegration(plugin);
        this.guilds = new GuildIntegration(plugin);
        this.server = HttpServer.create(new InetSocketAddress(config.server().bindHost(), config.server().port()), 64);
        this.executor = Executors.newFixedThreadPool(config.server().workerThreads(), runnable -> {
            Thread thread = new Thread(runnable, "EnthusiaCompetitionBridge-HTTP");
            thread.setDaemon(true);
            return thread;
        });
        server.setExecutor(executor);
        server.createContext("/", this::handle);
    }

    void start() { server.start(); }

    private void handle(HttpExchange exchange) {
        try {
            securityHeaders(exchange);
            if (!"POST".equals(exchange.getRequestMethod())) {
                send(exchange, 405, error("method_not_allowed", "Only POST is supported"));
                return;
            }
            String path = exchange.getRequestURI().getPath();
            if (!allowedRoute(path)) {
                send(exchange, 404, error("not_found", "Unknown bridge route"));
                return;
            }
            String contentType = exchange.getRequestHeaders().getFirst("Content-Type");
            if (contentType == null || !contentType.toLowerCase().startsWith("application/json")) {
                send(exchange, 415, error("json_required", "Content-Type must be application/json"));
                return;
            }

            byte[] body = readBody(exchange);
            RequestAuthenticator.Result auth = authenticator.verify(
                    "POST",
                    path,
                    body,
                    new RequestAuthenticator.Headers(
                            exchange.getRequestHeaders().getFirst("Authorization"),
                            exchange.getRequestHeaders().getFirst("X-Enthusia-Timestamp"),
                            exchange.getRequestHeaders().getFirst("X-Enthusia-Nonce"),
                            exchange.getRequestHeaders().getFirst("X-Enthusia-Content-Sha256"),
                            exchange.getRequestHeaders().getFirst("X-Enthusia-Signature")
                    )
            );
            if (!auth.accepted()) {
                if (config.logging().rejectedRequests()) plugin.getLogger().warning("Rejected competition bridge request " + path + ": " + auth.error());
                send(exchange, auth.status(), error(auth.error(), "Request authentication failed"));
                return;
            }

            JsonObject input;
            try {
                input = JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject();
            } catch (Exception exception) {
                send(exchange, 400, error("invalid_json", "JSON object required"));
                return;
            }

            JsonObject output = switch (path) {
                case "/v1/competitions/player-context" -> playerContext(input);
                case "/v1/competitions/player-lookup" -> playerLookup(input);
                case "/v1/competitions/guild-members" -> guildMembers(input);
                case "/v1/competitions/rewards/deliver" -> rewards.deliver(config, input, body);
                case "/v1/competitions/notifications/submission" -> submissionNotification(input);
                case "/v1/competitions/notifications/contributor" -> contributorNotification(input);
                default -> throw new BridgeRequestException(404, "not_found", "Unknown bridge route");
            };
            if (config.logging().successfulRequests()) plugin.getLogger().info("Competition bridge request completed: " + path);
            send(exchange, 200, output);
        } catch (BridgeRequestException exception) {
            safeSend(exchange, exception.status(), error(exception.code(), exception.getMessage()));
        } catch (Exception exception) {
            plugin.getLogger().warning("Competition bridge request failed: " + safe(exception));
            safeSend(exchange, 503, error("bridge_unavailable", "Bridge operation failed"));
        } finally {
            exchange.close();
        }
    }

    private JsonObject playerContext(JsonObject input) throws Exception {
        text(input, "accountSubject", 256);
        UUID playerUuid = uuid(input, "playerUuid");
        String name = knownName(playerUuid);
        long activeMinutes = playtime.activeMinutes(config, playerUuid);
        JsonArray linked = new JsonArray();
        JsonObject account = new JsonObject();
        account.addProperty("uuid", playerUuid.toString());
        account.addProperty("name", name);
        linked.add(account);

        JsonArray guildArray = new JsonArray();
        for (GuildIntegration.GuildView guild : guilds.guildsFor(config, playerUuid)) {
            JsonObject row = new JsonObject();
            row.addProperty("id", guild.id());
            row.addProperty("name", guild.name());
            JsonArray permissions = new JsonArray();
            guild.permissions().forEach(permissions::add);
            row.add("permissions", permissions);
            guildArray.add(row);
        }

        JsonObject output = new JsonObject();
        output.addProperty("activeMinutes", activeMinutes);
        output.add("linkedMinecraftAccounts", linked);
        output.add("guilds", guildArray);
        output.addProperty("fetchedAt", Instant.now().toString());
        output.addProperty("identityProvider", "CURRENT_ACCOUNT_ONLY");
        return output;
    }

    private JsonObject playerLookup(JsonObject input) throws Exception {
        String requested = text(input, "minecraftName", 16);
        return MainThreadBridge.call(plugin, config.server().mainThreadTimeoutMs(), () -> {
            Player online = Bukkit.getPlayerExact(requested);
            if (online != null) return playerResult(online.getUniqueId(), online.getName());
            for (OfflinePlayer player : Bukkit.getOfflinePlayers()) {
                if (player.getName() != null && player.getName().equalsIgnoreCase(requested)) {
                    return playerResult(player.getUniqueId(), player.getName());
                }
            }
            throw new BridgeRequestException(404, "player_not_found", "Player is not known to this server");
        });
    }

    private JsonObject guildMembers(JsonObject input) throws Exception {
        UUID guildId = uuid(input, "guildId");
        Set<UUID> members = guilds.members(config, guildId);
        JsonArray values = new JsonArray();
        members.stream().map(UUID::toString).sorted().forEach(values::add);
        JsonObject output = new JsonObject();
        output.add("members", values);
        return output;
    }

    private JsonObject submissionNotification(JsonObject input) throws Exception {
        String competitionTitle = text(input, "competitionTitle", 160);
        String submissionTitle = text(input, "submissionTitle", 160);
        String ownerName = optionalText(input, "ownerName", 32, "unknown player");
        String reviewUrl = optionalText(input, "reviewUrl", 500, "");
        String message = color(config.notifications().staffPrefix())
                + "New submission: " + submissionTitle + " by " + ownerName + " in " + competitionTitle
                + (reviewUrl.isBlank() ? "" : " — " + reviewUrl);
        MainThreadBridge.call(plugin, config.server().mainThreadTimeoutMs(), () -> {
            for (Player player : Bukkit.getOnlinePlayers()) {
                if (player.hasPermission(config.staff().reviewPermission())) player.sendMessage(message);
            }
            return null;
        });
        return status("ACCEPTED");
    }

    private JsonObject contributorNotification(JsonObject input) throws Exception {
        String action = optionalText(input, "action", 16, "UPSERT").toUpperCase();
        String competitionId = text(input, "competitionId", 80);
        String submissionId = text(input, "submissionId", 80);
        UUID playerUuid = uuid(input, "playerUuid");
        if (action.equals("CLEAR")) {
            repository.resolveContributorReminder(competitionId, submissionId, playerUuid);
            return status("CLEARED");
        }
        if (!action.equals("UPSERT")) throw new BridgeRequestException(400, "invalid_notification_action", "action must be UPSERT or CLEAR");
        String competitionTitle = text(input, "competitionTitle", 160);
        String submissionTitle = text(input, "submissionTitle", 160);
        String role = text(input, "role", 32);
        String actionUrl = optionalText(input, "actionUrl", 500, "");
        BridgeRepository.ContributorReminder reminder = new BridgeRepository.ContributorReminder(
                competitionId, submissionId, playerUuid, competitionTitle, submissionTitle, role, actionUrl.isBlank() ? null : actionUrl);
        repository.upsertContributorReminder(reminder, System.currentTimeMillis());
        String message = contributorMessage(config, reminder);
        MainThreadBridge.call(plugin, config.server().mainThreadTimeoutMs(), () -> {
            Player player = Bukkit.getPlayer(playerUuid);
            if (player != null && player.isOnline()) player.sendMessage(message);
            return null;
        });
        return status("ACCEPTED");
    }

    static String contributorMessage(BridgeConfig config, BridgeRepository.ContributorReminder reminder) {
        return color(config.notifications().contributorPrefix())
                + "You were invited as " + reminder.role().toLowerCase().replace('_', ' ')
                + " on “" + reminder.submissionTitle() + "” in " + reminder.competitionTitle() + "."
                + (reminder.actionUrl() == null || reminder.actionUrl().isBlank() ? "" : " Respond: " + reminder.actionUrl());
    }

    private String knownName(UUID uuid) throws Exception {
        return MainThreadBridge.call(plugin, config.server().mainThreadTimeoutMs(), () -> {
            OfflinePlayer player = Bukkit.getOfflinePlayer(uuid);
            String name = player.getName();
            if (name == null || !name.matches("[A-Za-z0-9_]{1,16}")) {
                throw new BridgeRequestException(404, "player_not_found", "Player is not known to this server");
            }
            return name;
        });
    }

    private byte[] readBody(HttpExchange exchange) throws Exception {
        String declared = exchange.getRequestHeaders().getFirst("Content-Length");
        if (declared != null) {
            try {
                if (Long.parseLong(declared) > config.server().maxRequestBytes()) {
                    throw new BridgeRequestException(413, "request_too_large", "Request exceeds configured body limit");
                }
            } catch (NumberFormatException ignored) {}
        }
        byte[] body = exchange.getRequestBody().readNBytes(config.server().maxRequestBytes() + 1);
        if (body.length > config.server().maxRequestBytes()) throw new BridgeRequestException(413, "request_too_large", "Request exceeds configured body limit");
        return body;
    }

    private static boolean allowedRoute(String path) {
        return path.equals("/v1/competitions/player-context")
                || path.equals("/v1/competitions/player-lookup")
                || path.equals("/v1/competitions/guild-members")
                || path.equals("/v1/competitions/rewards/deliver")
                || path.equals("/v1/competitions/notifications/submission")
                || path.equals("/v1/competitions/notifications/contributor");
    }

    private static JsonObject playerResult(UUID uuid, String name) {
        JsonObject output = new JsonObject();
        output.addProperty("uuid", uuid.toString());
        output.addProperty("name", name);
        return output;
    }

    private static JsonObject status(String status) {
        JsonObject output = new JsonObject();
        output.addProperty("status", status);
        return output;
    }

    private static JsonObject error(String code, String message) {
        JsonObject output = new JsonObject();
        output.addProperty("error", code);
        output.addProperty("message", message);
        return output;
    }

    private static String text(JsonObject input, String key, int max) throws BridgeRequestException {
        try {
            String value = input.get(key).getAsString().trim();
            if (value.isEmpty() || value.length() > max) throw new IllegalArgumentException();
            return value;
        } catch (Exception exception) {
            throw new BridgeRequestException(400, "invalid_request", key + " is invalid");
        }
    }

    private static String optionalText(JsonObject input, String key, int max, String fallback) throws BridgeRequestException {
        if (!input.has(key) || input.get(key).isJsonNull()) return fallback;
        String value = input.get(key).getAsString().trim();
        if (value.length() > max) throw new BridgeRequestException(400, "invalid_request", key + " is too long");
        return value.isEmpty() ? fallback : value;
    }

    private static UUID uuid(JsonObject input, String key) throws BridgeRequestException {
        try { return UUID.fromString(text(input, key, 128)); }
        catch (IllegalArgumentException exception) { throw new BridgeRequestException(400, "invalid_request", key + " must be a UUID"); }
    }

    private static String color(String value) {
        return ChatColor.translateAlternateColorCodes('&', value == null ? "" : value);
    }

    private static void securityHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
    }

    private static void send(HttpExchange exchange, int status, JsonObject body) throws IOException {
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
    }

    private static void safeSend(HttpExchange exchange, int status, JsonObject body) {
        try { send(exchange, status, body); } catch (Exception ignored) {}
    }

    private static String safe(Exception exception) {
        String value = exception.getMessage();
        if (value == null || value.isBlank()) value = exception.getClass().getSimpleName();
        return value.length() > 300 ? value.substring(0, 300) : value;
    }

    @Override
    public void close() {
        server.stop(0);
        executor.shutdownNow();
    }
}
