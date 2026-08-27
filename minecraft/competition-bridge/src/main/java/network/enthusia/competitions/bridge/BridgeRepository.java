package network.enthusia.competitions.bridge;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.Closeable;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public final class BridgeRepository implements Closeable {
    private final String jdbcUrl;

    public BridgeRepository(Path dataFolder) throws Exception {
        Objects.requireNonNull(dataFolder, "dataFolder");
        Files.createDirectories(dataFolder);
        Path database = dataFolder.resolve("bridge.db").toAbsolutePath().normalize();
        this.jdbcUrl = "jdbc:sqlite:" + database;
        Class.forName("org.sqlite.JDBC");
        migrate();
    }

    private Connection open() throws SQLException {
        Connection connection = DriverManager.getConnection(jdbcUrl);
        try (Statement statement = connection.createStatement()) {
            statement.execute("PRAGMA foreign_keys = ON");
            statement.execute("PRAGMA busy_timeout = 5000");
            statement.execute("PRAGMA synchronous = FULL");
        }
        return connection;
    }

    private void migrate() throws SQLException {
        try (Connection connection = open(); Statement statement = connection.createStatement()) {
            statement.execute("PRAGMA journal_mode = WAL");
            createRequestNonceTable(statement);
            createRewardOperationTable(statement);
            if (!hasColumn(connection, "reward_operations", "request_hash")) {
                statement.execute("ALTER TABLE reward_operations ADD COLUMN request_hash TEXT");
            }
            createPendingItemTable(statement);
            createContributorReminderTable(statement);
            createIndexes(statement);
        }
    }

    private static void createRequestNonceTable(Statement statement) throws SQLException {
        statement.execute("""
                CREATE TABLE IF NOT EXISTS request_nonces (
                  nonce TEXT PRIMARY KEY,
                  seen_at INTEGER NOT NULL
                )
                """);
    }

    private static void createRewardOperationTable(Statement statement) throws SQLException {
        statement.execute("""
                CREATE TABLE IF NOT EXISTS reward_operations (
                  operation_key TEXT PRIMARY KEY,
                  reward_type TEXT NOT NULL,
                  recipient_uuid TEXT NOT NULL,
                  request_hash TEXT,
                  state TEXT NOT NULL CHECK(state IN ('CLAIMED','DELIVERED','FAILED_RECONCILE')),
                  detail_json TEXT,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL
                )
                """);
    }

    private static void createPendingItemTable(Statement statement) throws SQLException {
        statement.execute("""
                CREATE TABLE IF NOT EXISTS pending_item_rewards (
                  operation_key TEXT PRIMARY KEY REFERENCES reward_operations(operation_key) ON DELETE CASCADE,
                  player_uuid TEXT NOT NULL,
                  material_key TEXT NOT NULL,
                  remaining INTEGER NOT NULL CHECK(remaining > 0),
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL
                )
                """);
    }

    private static void createContributorReminderTable(Statement statement) throws SQLException {
        statement.execute("""
                CREATE TABLE IF NOT EXISTS contributor_reminders (
                  competition_id TEXT NOT NULL,
                  submission_id TEXT NOT NULL,
                  player_uuid TEXT NOT NULL,
                  competition_title TEXT NOT NULL,
                  submission_title TEXT NOT NULL,
                  role TEXT NOT NULL,
                  action_url TEXT,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL,
                  PRIMARY KEY (competition_id, submission_id, player_uuid)
                )
                """);
    }

    private static void createIndexes(Statement statement) throws SQLException {
        statement.execute("CREATE INDEX IF NOT EXISTS idx_request_nonces_seen ON request_nonces(seen_at)");
        statement.execute("CREATE INDEX IF NOT EXISTS idx_pending_items_player ON pending_item_rewards(player_uuid)");
        statement.execute("CREATE INDEX IF NOT EXISTS idx_contributor_reminders_player ON contributor_reminders(player_uuid)");
    }

    private static boolean hasColumn(Connection connection, String table, String column) throws SQLException {
        try (Statement statement = connection.createStatement(); ResultSet result = statement.executeQuery("PRAGMA table_info(" + table + ")")) {
            while (result.next()) if (column.equalsIgnoreCase(result.getString("name"))) return true;
            return false;
        }
    }

    public boolean acceptNonce(String nonce, long nowMillis, long retainMillis) throws SQLException {
        if (nonce == null || nonce.isBlank() || nonce.length() > 128) return false;
        try (Connection connection = open()) {
            connection.setAutoCommit(false);
            try {
                try (PreparedStatement prune = connection.prepareStatement("DELETE FROM request_nonces WHERE seen_at < ?")) {
                    prune.setLong(1, nowMillis - retainMillis);
                    prune.executeUpdate();
                }
                int inserted;
                try (PreparedStatement insert = connection.prepareStatement("INSERT OR IGNORE INTO request_nonces(nonce, seen_at) VALUES (?, ?)")) {
                    insert.setString(1, nonce);
                    insert.setLong(2, nowMillis);
                    inserted = insert.executeUpdate();
                }
                connection.commit();
                return inserted == 1;
            } catch (SQLException failure) {
                connection.rollback();
                throw failure;
            } finally {
                connection.setAutoCommit(true);
            }
        }
    }

    public RewardClaim claimReward(String operationKey, String rewardType, UUID recipientUuid, String requestHash, long nowMillis) throws SQLException {
        requireKey(operationKey);
        Objects.requireNonNull(rewardType, "rewardType");
        Objects.requireNonNull(recipientUuid, "recipientUuid");
        requireHash(requestHash);
        try (Connection connection = open()) {
            connection.setAutoCommit(false);
            try {
                Optional<RewardOperation> existing = rewardOperation(connection, operationKey);
                if (existing.isPresent()) {
                    RewardOperation operation = existing.get();
                    connection.commit();
                    return existingRewardClaim(operation, rewardType, recipientUuid, requestHash);
                }
                insertRewardClaim(connection, operationKey, rewardType, recipientUuid, requestHash, nowMillis);
                RewardOperation created = new RewardOperation(operationKey, rewardType, recipientUuid, requestHash, "CLAIMED", null, nowMillis, nowMillis);
                connection.commit();
                return new RewardClaim(RewardClaimState.CLAIMED, created);
            } catch (SQLException failure) {
                connection.rollback();
                throw failure;
            } finally {
                connection.setAutoCommit(true);
            }
        }
    }

    private static RewardClaim existingRewardClaim(
            RewardOperation operation, String rewardType, UUID recipientUuid, String requestHash) throws SQLException {
        boolean sameIdentity = operation.rewardType().equals(rewardType)
                && operation.recipientUuid().equals(recipientUuid)
                && (operation.requestHash() == null || operation.requestHash().equals(requestHash));
        if (!sameIdentity) return new RewardClaim(RewardClaimState.OPERATION_CONFLICT, operation);
        return switch (operation.state()) {
            case "DELIVERED" -> new RewardClaim(RewardClaimState.ALREADY_DELIVERED, operation);
            case "CLAIMED", "FAILED_RECONCILE" -> new RewardClaim(RewardClaimState.RECONCILIATION_REQUIRED, operation);
            default -> throw new SQLException("Unknown reward state " + operation.state());
        };
    }

    private static void insertRewardClaim(
            Connection connection,
            String operationKey,
            String rewardType,
            UUID recipientUuid,
            String requestHash,
            long nowMillis
    ) throws SQLException {
        try (PreparedStatement insert = connection.prepareStatement("""
                INSERT INTO reward_operations(
                  operation_key, reward_type, recipient_uuid, request_hash, state,
                  detail_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'CLAIMED', NULL, ?, ?)
                """)) {
            insert.setString(1, operationKey);
            insert.setString(2, rewardType);
            insert.setString(3, recipientUuid.toString());
            insert.setString(4, requestHash);
            insert.setLong(5, nowMillis);
            insert.setLong(6, nowMillis);
            insert.executeUpdate();
        }
    }

    public void markRewardDelivered(String operationKey, JsonObject detail, long nowMillis) throws SQLException {
        updateRewardState(operationKey, "DELIVERED", detail, nowMillis);
    }

    public void markRewardReconciliationRequired(String operationKey, JsonObject detail, long nowMillis) throws SQLException {
        updateRewardState(operationKey, "FAILED_RECONCILE", detail, nowMillis);
    }

    private void updateRewardState(String operationKey, String state, JsonObject detail, long nowMillis) throws SQLException {
        requireKey(operationKey);
        try (Connection connection = open(); PreparedStatement statement = connection.prepareStatement("""
                UPDATE reward_operations
                SET state = ?, detail_json = ?, updated_at = ?
                WHERE operation_key = ?
                """)) {
            statement.setString(1, state);
            statement.setString(2, detail == null ? null : detail.toString());
            statement.setLong(3, nowMillis);
            statement.setString(4, operationKey);
            if (statement.executeUpdate() != 1) throw new SQLException("Reward operation does not exist: " + operationKey);
        }
    }

    public void acceptQueuedItem(String operationKey, UUID playerUuid, String materialKey, int amount, JsonObject detail, long nowMillis) throws SQLException {
        requireKey(operationKey);
        if (amount <= 0) throw new IllegalArgumentException("Queued item amount must be positive");
        try (Connection connection = open()) {
            connection.setAutoCommit(false);
            try {
                try (PreparedStatement insert = connection.prepareStatement("""
                        INSERT INTO pending_item_rewards(operation_key,player_uuid,material_key,remaining,created_at,updated_at)
                        VALUES(?,?,?,?,?,?)
                        ON CONFLICT(operation_key) DO NOTHING
                        """)) {
                    insert.setString(1, operationKey);
                    insert.setString(2, playerUuid.toString());
                    insert.setString(3, materialKey);
                    insert.setInt(4, amount);
                    insert.setLong(5, nowMillis);
                    insert.setLong(6, nowMillis);
                    insert.executeUpdate();
                }
                try (PreparedStatement update = connection.prepareStatement("""
                        UPDATE reward_operations
                        SET state='DELIVERED',detail_json=?,updated_at=?
                        WHERE operation_key=? AND state='CLAIMED'
                        """)) {
                    update.setString(1, detail == null ? null : detail.toString());
                    update.setLong(2, nowMillis);
                    update.setString(3, operationKey);
                    if (update.executeUpdate() != 1) throw new SQLException("Reward operation is not claimable: " + operationKey);
                }
                connection.commit();
            } catch (SQLException failure) {
                connection.rollback();
                throw failure;
            } finally {
                connection.setAutoCommit(true);
            }
        }
    }

    public List<PendingItem> pendingItems(UUID playerUuid) throws SQLException {
        List<PendingItem> items = new ArrayList<>();
        try (Connection connection = open(); PreparedStatement statement = connection.prepareStatement("""
                SELECT operation_key,player_uuid,material_key,remaining
                FROM pending_item_rewards WHERE player_uuid=? ORDER BY created_at,operation_key
                """)) {
            statement.setString(1, playerUuid.toString());
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    items.add(new PendingItem(
                            result.getString("operation_key"),
                            UUID.fromString(result.getString("player_uuid")),
                            result.getString("material_key"),
                            result.getInt("remaining")
                    ));
                }
            }
        }
        return items;
    }

    public void updatePendingItem(String operationKey, int remaining, long nowMillis) throws SQLException {
        requireKey(operationKey);
        if (remaining <= 0) {
            try (Connection connection = open(); PreparedStatement statement = connection.prepareStatement(
                    "DELETE FROM pending_item_rewards WHERE operation_key=?")) {
                statement.setString(1, operationKey);
                statement.executeUpdate();
            }
            return;
        }
        try (Connection connection = open(); PreparedStatement statement = connection.prepareStatement(
                "UPDATE pending_item_rewards SET remaining=?,updated_at=? WHERE operation_key=?")) {
            statement.setInt(1, remaining);
            statement.setLong(2, nowMillis);
            statement.setString(3, operationKey);
            statement.executeUpdate();
        }
    }

    public Optional<RewardOperation> rewardOperation(String operationKey) throws SQLException {
        try (Connection connection = open()) {
            return rewardOperation(connection, operationKey);
        }
    }

    private Optional<RewardOperation> rewardOperation(Connection connection, String operationKey) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT operation_key, reward_type, recipient_uuid, request_hash, state,
                       detail_json, created_at, updated_at
                FROM reward_operations WHERE operation_key = ? LIMIT 1
                """)) {
            statement.setString(1, operationKey);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) return Optional.empty();
                String detailText = result.getString("detail_json");
                JsonObject detail = detailText == null ? null : JsonParser.parseString(detailText).getAsJsonObject();
                return Optional.of(new RewardOperation(
                        result.getString("operation_key"),
                        result.getString("reward_type"),
                        UUID.fromString(result.getString("recipient_uuid")),
                        result.getString("request_hash"),
                        result.getString("state"),
                        detail,
                        result.getLong("created_at"),
                        result.getLong("updated_at")
                ));
            }
        }
    }

    public void upsertContributorReminder(ContributorReminder reminder, long nowMillis) throws SQLException {
        Objects.requireNonNull(reminder, "reminder");
        try (Connection connection = open(); PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO contributor_reminders(
                  competition_id, submission_id, player_uuid, competition_title,
                  submission_title, role, action_url, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(competition_id, submission_id, player_uuid) DO UPDATE SET
                  competition_title = excluded.competition_title,
                  submission_title = excluded.submission_title,
                  role = excluded.role,
                  action_url = excluded.action_url,
                  updated_at = excluded.updated_at
                """)) {
            statement.setString(1, reminder.competitionId());
            statement.setString(2, reminder.submissionId());
            statement.setString(3, reminder.playerUuid().toString());
            statement.setString(4, reminder.competitionTitle());
            statement.setString(5, reminder.submissionTitle());
            statement.setString(6, reminder.role());
            statement.setString(7, reminder.actionUrl());
            statement.setLong(8, nowMillis);
            statement.setLong(9, nowMillis);
            statement.executeUpdate();
        }
    }

    public boolean resolveContributorReminder(String competitionId, String submissionId, UUID playerUuid) throws SQLException {
        try (Connection connection = open(); PreparedStatement statement = connection.prepareStatement("""
                DELETE FROM contributor_reminders
                WHERE competition_id = ? AND submission_id = ? AND player_uuid = ?
                """)) {
            statement.setString(1, competitionId);
            statement.setString(2, submissionId);
            statement.setString(3, playerUuid.toString());
            return statement.executeUpdate() == 1;
        }
    }

    public List<ContributorReminder> contributorReminders(UUID playerUuid) throws SQLException {
        List<ContributorReminder> reminders = new ArrayList<>();
        try (Connection connection = open(); PreparedStatement statement = connection.prepareStatement("""
                SELECT competition_id, submission_id, player_uuid, competition_title,
                       submission_title, role, action_url
                FROM contributor_reminders
                WHERE player_uuid = ?
                ORDER BY created_at ASC
                """)) {
            statement.setString(1, playerUuid.toString());
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    reminders.add(new ContributorReminder(
                            result.getString("competition_id"),
                            result.getString("submission_id"),
                            UUID.fromString(result.getString("player_uuid")),
                            result.getString("competition_title"),
                            result.getString("submission_title"),
                            result.getString("role"),
                            result.getString("action_url")
                    ));
                }
            }
        }
        return reminders;
    }

    public RepositoryStatus status() throws SQLException {
        try (Connection connection = open(); Statement statement = connection.createStatement()) {
            long nonceCount;
            long unresolvedCount;
            long deliveredCount;
            long reminderCount;
            long pendingItemCount;
            try (ResultSet result = statement.executeQuery("SELECT COUNT(*) FROM request_nonces")) {
                nonceCount = result.next() ? result.getLong(1) : 0;
            }
            try (ResultSet result = statement.executeQuery("SELECT COUNT(*) FROM reward_operations WHERE state <> 'DELIVERED'")) {
                unresolvedCount = result.next() ? result.getLong(1) : 0;
            }
            try (ResultSet result = statement.executeQuery("SELECT COUNT(*) FROM reward_operations WHERE state = 'DELIVERED'")) {
                deliveredCount = result.next() ? result.getLong(1) : 0;
            }
            try (ResultSet result = statement.executeQuery("SELECT COUNT(*) FROM contributor_reminders")) {
                reminderCount = result.next() ? result.getLong(1) : 0;
            }
            try (ResultSet result = statement.executeQuery("SELECT COUNT(*) FROM pending_item_rewards")) {
                pendingItemCount = result.next() ? result.getLong(1) : 0;
            }
            return new RepositoryStatus(nonceCount, unresolvedCount, deliveredCount, reminderCount, pendingItemCount);
        }
    }

    private static void requireKey(String operationKey) {
        if (operationKey == null || operationKey.isBlank() || operationKey.length() > 240 || !operationKey.matches("[A-Za-z0-9._:-]+")) {
            throw new IllegalArgumentException("Invalid operation key");
        }
    }

    private static void requireHash(String requestHash) {
        if (requestHash == null || !requestHash.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("Invalid request hash");
    }

    @Override
    public void close() {
        // Connections are short-lived per operation; nothing remains open here.
    }

    public enum RewardClaimState { CLAIMED, ALREADY_DELIVERED, RECONCILIATION_REQUIRED, OPERATION_CONFLICT }
    public record RewardClaim(RewardClaimState state, RewardOperation operation) {}
    public record RewardOperation(String operationKey, String rewardType, UUID recipientUuid, String requestHash, String state, JsonObject detail, long createdAt, long updatedAt) {}
    public record PendingItem(String operationKey, UUID playerUuid, String materialKey, int remaining) {}
    public record ContributorReminder(String competitionId, String submissionId, UUID playerUuid, String competitionTitle, String submissionTitle, String role, String actionUrl) {}
    public record RepositoryStatus(long nonceCount, long unresolvedRewards, long deliveredRewards, long contributorReminders, long pendingItems) {}
}
