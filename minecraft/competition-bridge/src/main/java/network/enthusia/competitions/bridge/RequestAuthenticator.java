package network.enthusia.competitions.bridge;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.Base64;
import java.util.UUID;

public final class RequestAuthenticator {
    public record Headers(String authorization, String timestamp, String nonce, String contentHash, String signature) {}
    public record Result(boolean accepted, int status, String error) {
        static Result ok() { return new Result(true, 200, null); }
        static Result reject(int status, String error) { return new Result(false, status, error); }
    }

    private final BridgeConfig.Security security;
    private final BridgeRepository repository;
    private final Clock clock;

    public RequestAuthenticator(BridgeConfig.Security security, BridgeRepository repository) {
        this(security, repository, Clock.systemUTC());
    }

    RequestAuthenticator(BridgeConfig.Security security, BridgeRepository repository, Clock clock) {
        this.security = security;
        this.repository = repository;
        this.clock = clock;
    }

    public Result verify(String method, String path, byte[] body, Headers headers) throws Exception {
        if (!constantEquals("Bearer " + security.bearerToken(), headers.authorization())) {
            return Result.reject(401, "invalid_bearer");
        }

        long timestamp;
        try {
            timestamp = Long.parseLong(headers.timestamp());
        } catch (Exception exception) {
            return Result.reject(401, "invalid_timestamp");
        }
        long now = clock.millis();
        if (Math.abs(now - timestamp) > security.maxClockSkewSeconds() * 1000L) {
            return Result.reject(401, "stale_request");
        }

        String nonce = headers.nonce();
        try {
            UUID.fromString(nonce);
        } catch (Exception exception) {
            return Result.reject(401, "invalid_nonce");
        }

        String expectedHash = base64Url(sha256(body));
        if (!constantEquals(expectedHash, headers.contentHash())) {
            return Result.reject(401, "content_hash_mismatch");
        }

        String canonical = method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + expectedHash;
        String expectedSignature = base64Url(hmac(security.hmacSecret(), canonical));
        if (!constantEquals(expectedSignature, headers.signature())) {
            return Result.reject(401, "invalid_signature");
        }

        boolean accepted = repository.acceptNonce(
                nonce,
                now,
                security.nonceRetentionSeconds() * 1000L
        );
        return accepted ? Result.ok() : Result.reject(409, "replayed_nonce");
    }

    private static byte[] sha256(byte[] value) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(value);
    }

    private static byte[] hmac(String secret, String value) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String base64Url(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private static boolean constantEquals(String left, String right) {
        byte[] a = left == null ? new byte[0] : left.getBytes(StandardCharsets.UTF_8);
        byte[] b = right == null ? new byte[0] : right.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(a, b);
    }
}
