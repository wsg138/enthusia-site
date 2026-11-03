package network.enthusia.competitions.bridge;

import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CommunityFeedHttpServerTest {
    @Test void requestedPlayerFeedRequiresTokenRejectsInvalidQueriesAndDoesNotCacheAcrossRequests() throws Exception {
        int port = freePort();
        String token="test-only-"+"a".repeat(32); AtomicInteger captures=new AtomicInteger();
        var server=new CommunityFeedHttpServer(port,token,new CommunityFeedHttpServer.Source() {
            public Map<String,Object> read(String kind) { return Map.of(); }
            public Map<String,Object> readPlayers(List<UUID> players) { captures.incrementAndGet(); return Map.of("count",players.size()); }
        });
        server.start();
        try {
            HttpClient client=HttpClient.newHttpClient();String base="http://127.0.0.1:"+port+"/api/community/player-achievements";
            String id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
            String queryPrefix = "?players=";
            java.util.function.BiFunction<String,Boolean,HttpResponse<String>> get=(query,auth)->{
                try { var request=HttpRequest.newBuilder(URI.create(base+query)); if(auth)request.header("Authorization","Bearer "+token);
                    return client.send(request.build(),HttpResponse.BodyHandlers.ofString()); }
                catch(Exception failure) { throw new IllegalStateException(failure); }
            };
            assertEquals(401,get.apply(queryPrefix+id,false).statusCode());
            assertEquals(400,get.apply(queryPrefix+id+","+id.toUpperCase(java.util.Locale.ROOT),true).statusCode());
            assertEquals(400,get.apply(queryPrefix+id+"&extra=1",true).statusCode());
            assertEquals(200,get.apply(queryPrefix+id,true).statusCode());
            assertEquals(200,get.apply(queryPrefix+id,true).statusCode());
            assertEquals(2,captures.get());
        } finally { server.close(); }
    }
    @Test void publicRoutesEnforceAuthenticationMethodPathAndCacheWithoutDroppingNulls() throws Exception {
        int port = freePort();
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
    private static int freePort() throws Exception {
        try (var socket = new ServerSocket(0)) { return socket.getLocalPort(); }
    }
    @Test void missingTokenCannotOpenListener() {
        assertThrows(IllegalArgumentException.class, () -> new CommunityFeedHttpServer(8766, "", kind -> Map.of()));
    }
}
