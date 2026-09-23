package network.enthusia.competitions.bridge;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RequestAuthenticatorTest {
    @TempDir Path temp;

    @Test
    void verifiesWebsiteCanonicalSignatureAndRejectsNonceReplay() throws Exception {
        String bearer = "b".repeat(40);
        String secret = "h".repeat(40);
        long now = 1_800_000_000_000L;
        BridgeConfig.Security security = new BridgeConfig.Security(bearer, secret, 30, 120);
        try (BridgeRepository repository = new BridgeRepository(temp)) {
            RequestAuthenticator authenticator = new RequestAuthenticator(
                    security, repository, Clock.fixed(Instant.ofEpochMilli(now), ZoneOffset.UTC));
            byte[] body = "{\"accountSubject\":\"abc\"}".getBytes(StandardCharsets.UTF_8);
            String path = "/v1/competitions/player-context";
            String nonce = UUID.randomUUID().toString();
            String hash = base64(sha256(body));
            String signature = base64(hmac(secret, "POST\n" + path + "\n" + now + "\n" + nonce + "\n" + hash));
            RequestAuthenticator.Headers headers = new RequestAuthenticator.Headers(
                    "Bearer " + bearer, Long.toString(now), nonce, hash, signature);

            assertTrue(authenticator.verify("POST", path, body, headers).accepted());
            RequestAuthenticator.Result replay = authenticator.verify("POST", path, body, headers);
            assertFalse(replay.accepted());
            assertEquals("replayed_nonce", replay.error());
        }
    }

    @Test
    void rejectsTamperedBodyBeforeNonceIsConsumed() throws Exception {
        String bearer = "b".repeat(40);
        String secret = "h".repeat(40);
        long now = 1_800_000_000_000L;
        try (BridgeRepository repository = new BridgeRepository(temp)) {
            RequestAuthenticator authenticator = new RequestAuthenticator(
                    new BridgeConfig.Security(bearer, secret, 30, 120), repository,
                    Clock.fixed(Instant.ofEpochMilli(now), ZoneOffset.UTC));
            byte[] signed = "{}".getBytes(StandardCharsets.UTF_8);
            byte[] changed = "{\"x\":1}".getBytes(StandardCharsets.UTF_8);
            String path = "/v1/competitions/player-context";
            String nonce = UUID.randomUUID().toString();
            String hash = base64(sha256(signed));
            String signature = base64(hmac(secret, "POST\n" + path + "\n" + now + "\n" + nonce + "\n" + hash));
            RequestAuthenticator.Result result = authenticator.verify("POST", path, changed,
                    new RequestAuthenticator.Headers("Bearer " + bearer, Long.toString(now), nonce, hash, signature));
            assertFalse(result.accepted());
            assertEquals("content_hash_mismatch", result.error());
        }
    }

    private static byte[] sha256(byte[] value) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(value);
    }

    private static byte[] hmac(String secret, String value) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String base64(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }
}
