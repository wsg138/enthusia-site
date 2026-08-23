package network.enthusia.competitions.bridge;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BridgeRepositoryTest {
    @TempDir Path temp;

    @Test
    void rewardOperationRejectsChangedRequestBehindSameIdempotencyKey() throws Exception {
        UUID recipient = UUID.randomUUID();
        String key = "competition-reward:one";
        String hashA = "a".repeat(64);
        String hashB = "b".repeat(64);
        try (BridgeRepository repository = new BridgeRepository(temp)) {
            assertEquals(BridgeRepository.RewardClaimState.CLAIMED,
                    repository.claimReward(key, "MONEY", recipient, hashA, 1000).state());
            assertEquals(BridgeRepository.RewardClaimState.RECONCILIATION_REQUIRED,
                    repository.claimReward(key, "MONEY", recipient, hashA, 1001).state());
            assertEquals(BridgeRepository.RewardClaimState.OPERATION_CONFLICT,
                    repository.claimReward(key, "MONEY", recipient, hashB, 1002).state());
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
}
