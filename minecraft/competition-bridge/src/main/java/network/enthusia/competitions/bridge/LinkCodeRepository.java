package network.enthusia.competitions.bridge;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Instant;
import java.util.Base64;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

final class LinkCodeRepository implements AutoCloseable {
    private static final int SINGLE_ROW = 1;

    record LinkStatus(String status, UUID minecraftUuid, String minecraftName, long expiresAtMillis) {}

    private final String jdbcUrl;

    LinkCodeRepository(Path dataFolder) throws Exception {
        Objects.requireNonNull(dataFolder, "dataFolder");
        this.jdbcUrl = "jdbc:sqlite:" + dataFolder.resolve("bridge.db").toAbsolutePath().normalize();
        Class.forName("org.sqlite.JDBC");
        migrate();
    }

    private Connection open() throws Exception {
        Connection connection = DriverManager.getConnection(jdbcUrl);
        try (Statement statement = connection.createStatement()) {
            statement.execute("PRAGMA busy_timeout = 5000");
            statement.execute("PRAGMA synchronous = FULL");
        }
        return connection;
    }

    private void migrate() throws Exception {
        try (Connection connection = open(); Statement statement = connection.createStatement()) {
            statement.execute("""
                    CREATE TABLE IF NOT EXISTS minecraft_link_codes (
                      code_hash TEXT PRIMARY KEY,
                      expires_at INTEGER NOT NULL,
                      claimed_uuid TEXT,
                      claimed_name TEXT,
                      claimed_at INTEGER,
                      created_at INTEGER NOT NULL
                    )
                    """);
            statement.execute("CREATE INDEX IF NOT EXISTS idx_minecraft_link_codes_expiry ON minecraft_link_codes(expires_at)");
        }
    }

    synchronized void register(String codeHash, long expiresAtMillis, long nowMillis) throws Exception {
        requireHash(codeHash);
        if (expiresAtMillis <= nowMillis || expiresAtMillis > nowMillis + 10 * 60_000L) {
            throw new IllegalArgumentException("Link code expiry is outside the accepted window");
        }
        prune(nowMillis);
        try (Connection connection = open(); PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO minecraft_link_codes(code_hash,expires_at,claimed_uuid,claimed_name,claimed_at,created_at)
                VALUES(?,?,NULL,NULL,NULL,?)
                ON CONFLICT(code_hash) DO UPDATE SET
                  expires_at=excluded.expires_at
                WHERE minecraft_link_codes.claimed_at IS NULL
                """)) {
            statement.setString(1, codeHash);
            statement.setLong(2, expiresAtMillis);
            statement.setLong(3, nowMillis);
            statement.executeUpdate();
        }
    }

    synchronized LinkStatus claim(String rawCode, UUID playerUuid, String playerName, long nowMillis) throws Exception {
        if (rawCode == null || !rawCode.matches("[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}")) {
            return new LinkStatus("INVALID", null, null, 0L);
        }
        String codeHash = hash(rawCode);
        prune(nowMillis);
        try (Connection connection = open()) {
            connection.setAutoCommit(false);
            try {
                LinkStatus current = status(connection, codeHash, nowMillis);
                if (current.status().equals("CLAIMED")) {
                    connection.commit();
                    return current.minecraftUuid().equals(playerUuid)
                            ? current
                            : new LinkStatus("ALREADY_CLAIMED", current.minecraftUuid(), current.minecraftName(), current.expiresAtMillis());
                }
                if (!current.status().equals("PENDING")) {
                    connection.commit();
                    return current;
                }
                try (PreparedStatement update = connection.prepareStatement("""
                        UPDATE minecraft_link_codes
                        SET claimed_uuid=?,claimed_name=?,claimed_at=?
                        WHERE code_hash=? AND claimed_at IS NULL AND expires_at>?
                        """)) {
                    update.setString(1, playerUuid.toString());
                    update.setString(2, playerName);
                    update.setLong(3, nowMillis);
                    update.setString(4, codeHash);
                    update.setLong(5, nowMillis);
                    if (update.executeUpdate() != SINGLE_ROW) {
                        connection.rollback();
                        return new LinkStatus("CONFLICT", null, null, current.expiresAtMillis());
                    }
                }
                connection.commit();
                return new LinkStatus("CLAIMED", playerUuid, playerName, current.expiresAtMillis());
            } catch (Exception failure) {
                connection.rollback();
                throw failure;
            } finally {
                connection.setAutoCommit(true);
            }
        }
    }

    synchronized LinkStatus status(String codeHash, long nowMillis) throws Exception {
        requireHash(codeHash);
        prune(nowMillis);
        try (Connection connection = open()) {
            return status(connection, codeHash, nowMillis);
        }
    }

    private LinkStatus status(Connection connection, String codeHash, long nowMillis) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT expires_at,claimed_uuid,claimed_name
                FROM minecraft_link_codes WHERE code_hash=? LIMIT 1
                """)) {
            statement.setString(1, codeHash);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) return new LinkStatus("EXPIRED", null, null, 0L);
                long expiresAt = result.getLong("expires_at");
                if (expiresAt <= nowMillis) return new LinkStatus("EXPIRED", null, null, expiresAt);
                String uuidText = result.getString("claimed_uuid");
                if (uuidText == null) return new LinkStatus("PENDING", null, null, expiresAt);
                return new LinkStatus(
                        "CLAIMED",
                        UUID.fromString(uuidText),
                        result.getString("claimed_name"),
                        expiresAt
                );
            }
        }
    }

    synchronized void consume(String codeHash) throws Exception {
        requireHash(codeHash);
        try (Connection connection = open(); PreparedStatement statement = connection.prepareStatement(
                "DELETE FROM minecraft_link_codes WHERE code_hash=?")) {
            statement.setString(1, codeHash);
            statement.executeUpdate();
        }
    }

    private void prune(long nowMillis) throws Exception {
        try (Connection connection = open(); PreparedStatement statement = connection.prepareStatement(
                "DELETE FROM minecraft_link_codes WHERE expires_at<=?")) {
            statement.setLong(1, nowMillis);
            statement.executeUpdate();
        }
    }

    static String hash(String rawCode) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(rawCode.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }

    private static void requireHash(String value) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{43}")) {
            throw new IllegalArgumentException("Invalid link code hash");
        }
    }

    @Override
    public void close() {
        // Connections are intentionally short-lived.
    }
}
