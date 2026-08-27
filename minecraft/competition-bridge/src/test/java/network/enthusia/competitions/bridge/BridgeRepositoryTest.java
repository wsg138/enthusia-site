package network.enthusia.competitions.bridge;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BridgeRepositoryTest {
    private static final String MONEY_REWARD = "MONEY";

    @TempDir Path temp;

    @Test
    void migratesRewardOperationsCreatedBeforeRequestHashes() throws Exception {
        Class.forName("org.sqlite.JDBC");
        String jdbcUrl = "jdbc:sqlite:" + temp.resolve("bridge.db").toAbsolutePath().normalize();
        try (Connection connection = DriverManager.getConnection(jdbcUrl);
             Statement statement = connection.createStatement()) {
            statement.execute("""
                    CREATE TABLE reward_operations (
                      operation_key TEXT PRIMARY KEY,
                      reward_type TEXT NOT NULL,
                      recipient_uuid TEXT NOT NULL,
                      state TEXT NOT NULL CHECK(state IN ('CLAIMED','DELIVERED','FAILED_RECONCILE')),
                      detail_json TEXT,
                      created_at INTEGER NOT NULL,
                      updated_at INTEGER NOT NULL
                    )
                    """);
        }

        UUID recipient = UUID.randomUUID();
        try (BridgeRepository repository = new BridgeRepository(temp)) {
            BridgeRepository.RewardClaim claim = repository.claimReward(
                    "reward:legacy", MONEY_REWARD, recipient, "a".repeat(64), 5000);
            assertEquals(BridgeRepository.RewardClaimState.CLAIMED, claim.state());
            assertEquals("a".repeat(64), claim.operation().requestHash());
        }
    }

    @Test
    void rewardOperationRejectsChangedRequestBehindSameIdempotencyKey() throws Exception {
        UUID recipient = UUID.randomUUID();
        String key = "competition-reward:one";
        String hashA = "a".repeat(64);
        String hashB = "b".repeat(64);
        try (BridgeRepository repository = new BridgeRepository(temp)) {
            assertEquals(BridgeRepository.RewardClaimState.CLAIMED,
                    repository.claimReward(key, MONEY_REWARD, recipient, hashA, 1000).state());
            assertEquals(BridgeRepository.RewardClaimState.RECONCILIATION_REQUIRED,
                    repository.claimReward(key, MONEY_REWARD, recipient, hashA, 1001).state());
            assertEquals(BridgeRepository.RewardClaimState.OPERATION_CONFLICT,
                    repository.claimReward(key, MONEY_REWARD, recipient, hashB, 1002).state());
        }
    }

    @Test
    void queuedItemAcceptanceIsDurableAndIdempotentAtRewardLevel() throws Exception {
        UUID recipient = UUID.randomUUID();
        String key = "competition-reward:item";
        try (BridgeRepository repository = new BridgeRepository(temp)) {
            repository.claimReward(key, "ITEM", recipient, "c".repeat(64), 2000);
            JsonObject detail = new JsonObject();
            detail.addProperty("status", "ACCEPTED");
            repository.acceptQueuedItem(key, recipient, "minecraft:diamond", 4, detail, 2001);

            assertEquals(1, repository.pendingItems(recipient).size());
            assertEquals(4, repository.pendingItems(recipient).getFirst().remaining());
            assertEquals(BridgeRepository.RewardClaimState.ALREADY_DELIVERED,
                    repository.claimReward(key, "ITEM", recipient, "c".repeat(64), 2002).state());
            repository.updatePendingItem(key, 0, 2003);
            assertTrue(repository.pendingItems(recipient).isEmpty());
        }
    }

    @Test
    void contributorReminderCanBeUpsertedAndCleared() throws Exception {
        UUID player = UUID.randomUUID();
        BridgeRepository.ContributorReminder reminder = new BridgeRepository.ContributorReminder(
                "competition", "submission", player, "Build Contest", "Castle", "HELPER", "https://example.test");
        try (BridgeRepository repository = new BridgeRepository(temp)) {
            repository.upsertContributorReminder(reminder, 3000);
            assertEquals(1, repository.contributorReminders(player).size());
            assertTrue(repository.resolveContributorReminder("competition", "submission", player));
            assertTrue(repository.contributorReminders(player).isEmpty());
        }
    }

    @Test
    void repositoryStatusCountsEachPersistedWorkType() throws Exception {
        UUID player = UUID.randomUUID();
        JsonObject detail = new JsonObject();
        detail.addProperty("status", "ACCEPTED");
        try (BridgeRepository repository = new BridgeRepository(temp)) {
            assertEquals(new BridgeRepository.RepositoryStatus(0, 0, 0, 0, 0), repository.status());

            assertTrue(repository.acceptNonce("request-one", 4000, 1000));
            repository.claimReward("reward:delivered", MONEY_REWARD, player, "d".repeat(64), 4001);
            repository.markRewardDelivered("reward:delivered", detail, 4002);
            repository.claimReward("reward:queued", "ITEM", player, "e".repeat(64), 4003);
            repository.acceptQueuedItem("reward:queued", player, "minecraft:diamond", 2, detail, 4004);
            repository.claimReward("reward:unresolved", MONEY_REWARD, player, "f".repeat(64), 4005);
            repository.upsertContributorReminder(new BridgeRepository.ContributorReminder(
                    "competition", "submission", player, "Build Contest", "Castle", "HELPER", null), 4006);

            assertEquals(new BridgeRepository.RepositoryStatus(1, 1, 2, 1, 1), repository.status());
        }
    }
}
