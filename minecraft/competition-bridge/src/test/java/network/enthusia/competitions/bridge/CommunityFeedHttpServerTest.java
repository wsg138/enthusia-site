package network.enthusia.competitions.bridge;

import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CommunityFeedHttpServerTest {
    @Test void publicRoutesEnforceAuthenticationMethodPathAndCacheWithoutDroppingNulls() throws Exception {
        int port;
        try (var socket = new ServerSocket(0)) { port = socket.getLocalPort(); }
        String token = "test-only-" + "a".repeat(32);
        AtomicInteger captures = new AtomicInteger();
        var server = new CommunityFeedHttpServer(port, token, kind -> {
            captures.incrementAndGet();
            var snapshot = new LinkedHashMap<String, Object>();
            snapshot.put("completed", null);
            return snapshot;
        });
        server.start();
        try {
            HttpClient client = HttpClient.newHttpClient();
            String base = "http://127.0.0.1:" + port;
            var good = HttpRequest.newBuilder(URI.create(base + "/api/community/achievements")).header("Authorization", "Bearer " + token).build();
            var response = client.send(good, HttpResponse.BodyHandlers.ofString());
            assertEquals(200, response.statusCode());
            assertTrue(response.body().contains("\"completed\":null"));
            assertEquals(200, client.send(good, HttpResponse.BodyHandlers.ofString()).statusCode());
            assertEquals(1, captures.get());
            assertEquals(401, client.send(HttpRequest.newBuilder(good.uri()).build(), HttpResponse.BodyHandlers.ofString()).statusCode());
            assertEquals(405, client.send(HttpRequest.newBuilder(good.uri()).POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString()).statusCode());
            assertEquals(404, client.send(HttpRequest.newBuilder(URI.create(base + "/api/community/achievements/private")).build(), HttpResponse.BodyHandlers.ofString()).statusCode());
            var queried = HttpRequest.newBuilder(URI.create(base + "/api/community/achievements?private=true")).header("Authorization", "Bearer " + token).build();
            assertEquals(400, client.send(queried, HttpResponse.BodyHandlers.ofString()).statusCode());
        } finally { server.close(); }
    }
    @Test void missingTokenCannotOpenListener() {
        assertThrows(IllegalArgumentException.class, () -> new CommunityFeedHttpServer(8766, "", kind -> Map.of()));
    }
}
