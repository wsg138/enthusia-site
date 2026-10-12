package network.enthusia.competitions.bridge;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PublicCommunitySourcesTest {
    public record Whitelist(List<UUID> list) { public List<UUID> getList() { return list; } }
    public record Setter(double amount, List<String> items, Whitelist whitelist) {
        public double getAmount() { return amount; }
        public List<String> getItems() { return items; }
        public Whitelist getWhitelist() { return whitelist; }
    }
    public record Bounty(UUID uuid, String name, List<Setter> setters) {
        public UUID getUUID() { return uuid; }
        public String getName() { return name; }
        public List<Setter> getSetters() { return setters; }
    }
    @Test void onlyUnrestrictedCashContributionsArePublicAndNoSetterIdentityIsExported() throws Exception {
        UUID target = UUID.fromString("10000000-0000-4000-8000-000000000001");
        UUID privateHunter = UUID.fromString("20000000-0000-4000-8000-000000000002");
        Bounty bounty = new Bounty(target, ".BedrockName", List.of(
            new Setter(12.5, List.of(), new Whitelist(List.of())),
            new Setter(100, List.of(), new Whitelist(List.of(privateHunter))),
            new Setter(200, List.of("valued-item"), new Whitelist(List.of()))));
        Map<String, Object> snapshot = PublicCommunitySources.projectBounties(List.of(bounty), Instant.EPOCH);
        Map<?, ?> row = (Map<?, ?>) ((List<?>) snapshot.get("items")).getFirst();
        assertEquals(12.5, row.get("gold"));
        assertEquals(target.toString(), row.get("id"));
        assertFalse(snapshot.toString().contains(privateHunter.toString()));
        assertFalse(snapshot.toString().contains("valued-item"));
        assertFalse(row.containsKey("setters"));
        assertEquals(true, snapshot.get("limited"));
    }
    @Test void itemOnlyBountiesAreOmittedAndUnknownApiFailsClosed() throws Exception {
        Bounty bounty = new Bounty(UUID.randomUUID(), "Player", List.of(new Setter(2, List.of("item"), new Whitelist(List.of()))));
        assertEquals(List.of(), PublicCommunitySources.projectBounties(List.of(bounty), Instant.EPOCH).get("items"));
        assertThrows(Exception.class, () -> PublicCommunitySources.projectBounties(List.of(new Object()), Instant.EPOCH));
        Bounty invalid = new Bounty(UUID.randomUUID(), "Player", List.of(new Setter(Double.NaN, List.of(), new Whitelist(List.of()))));
        assertThrows(IllegalArgumentException.class, () -> PublicCommunitySources.projectBounties(List.of(invalid), Instant.EPOCH));
    }
    @Test void achievementProjectionStripsProviderInternalsAndDoesNotInventCompletionTotals() {
        Map<String, Object> row = Map.of("id", "provider:node", "name", "Real node", "description", "", "category", "provider", "icon", "diamond", "reward", "private command", "playerProgress", "private");
        var result = PublicCommunitySources.projectAchievements(Map.of("generatedAt", Instant.EPOCH.toString(), "items", List.of(row)));
        Map<?, ?> projected = (Map<?, ?>) ((List<?>) result.get("items")).getFirst();
        assertNull(projected.get("completed"));
        assertEquals("", projected.get("reward"));
        assertFalse(result.toString().contains("private"));
        assertThrows(java.time.format.DateTimeParseException.class, () -> PublicCommunitySources.projectAchievements(Map.of("generatedAt", "bad", "items", List.of())));
    }
}
