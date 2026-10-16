package network.enthusia.competitions.bridge;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Opt-in read-only loopback listener, separate from privileged competition routes. */
final class CommunityFeedHttpServer implements AutoCloseable {
    interface Source { Map<String, Object> read(String kind) throws Exception; }
    private record Cached(long readAt, byte[] body) {}
    private final Map<String, Cached> cache = new java.util.HashMap<>();
    private final Gson gson = new GsonBuilder().serializeNulls().disableHtmlEscaping().create();
    private final Source source;
    private final String token;
    private final HttpServer server;
    private final ThreadPoolExecutor executor;
    CommunityFeedHttpServer(int port, String token, Source source) throws IOException {
        if (port < 1 || port > 65535 || token == null || token.length() < 32 || token.length() > 8192
                || token.contains("\r") || token.contains("\n")) throw new IllegalArgumentException("Invalid community listener configuration");
        this.token = token;
        this.source = source;
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 16);
        executor = new ThreadPoolExecutor(1, 2, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(16), task -> {
            Thread thread = new Thread(task, "EnthusiaCommunity-Read"); thread.setDaemon(true); return thread;
        }, new ThreadPoolExecutor.AbortPolicy());
        server.setExecutor(executor);
        server.createContext("/", this::handle);
    }
    void start() { server.start(); }
    private void handle(HttpExchange exchange) {
        try {
            String path = exchange.getRequestURI().getPath();
            String kind = path.substring(path.lastIndexOf('/') + 1);
            if (!Set.of("bounties", "achievements").contains(kind) || !path.equals("/api/community/" + kind)) {
                send(exchange, 404, gson.toJson(Map.of("error", "not_found")).getBytes(StandardCharsets.UTF_8)); return;
            }
            if (!exchange.getRequestMethod().equals("GET")) { sendError(exchange, 405, "method_not_allowed"); return; }
            String supplied = exchange.getRequestHeaders().getFirst("Authorization");
            if (supplied == null || !MessageDigest.isEqual(supplied.getBytes(StandardCharsets.UTF_8),
                    ("Bearer " + token).getBytes(StandardCharsets.UTF_8))) { sendError(exchange, 401, "unauthorized"); return; }
            if (exchange.getRequestURI().getRawQuery() != null) { sendError(exchange, 400, "query_not_supported"); return; }
            send(exchange, 200, snapshot(kind));
        } catch (Exception failure) { try { sendError(exchange, 503, "public_feed_unavailable"); } catch (IOException ignored) { /* Client disconnected. */ } }
        finally { exchange.close(); }
    }
    private synchronized byte[] snapshot(String kind) throws Exception {
        long now = System.currentTimeMillis();
        Cached existing = cache.get(kind);
        if (existing != null && now - existing.readAt() < 60_000) return existing.body();
        byte[] body = gson.toJson(source.read(kind)).getBytes(StandardCharsets.UTF_8);
        if (body.length > 150_000) throw new IllegalArgumentException("Public feed too large");
        cache.put(kind, new Cached(now, body));
        return body;
    }
    private void sendError(HttpExchange exchange, int status, String error) throws IOException {
        send(exchange, status, gson.toJson(Map.of("error", error)).getBytes(StandardCharsets.UTF_8));
    }
    private static void send(HttpExchange exchange, int status, byte[] body) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, body.length);
        exchange.getResponseBody().write(body);
    }
    public void close() { server.stop(0); executor.shutdownNow(); cache.clear(); }
}
