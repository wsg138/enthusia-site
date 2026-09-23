package network.enthusia.competitions.bridge;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class LinkCodeRepositoryTest {
    @TempDir Path temp;

    @Test
    void hashMatchesWebsiteSha256Base64UrlContract() {
        assertEquals(
                "msIZfZJYJXsa6EY-QhTkzQpXi8FRfyQVkouRvkKD_Eg",
                LinkCodeRepository.hash("ABCDEFGH")
        );
    }

    @Test
    void registeredCodeCanBeClaimedOnceAndConsumed() throws Exception {
        long now = 1_800_000_000_000L;
        String code = "ABCDEFGH";
        String codeHash = LinkCodeRepository.hash(code);
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();

        try (LinkCodeRepository repository = new LinkCodeRepository(temp)) {
            repository.register(codeHash, now + 5 * 60_000L, now);

            LinkCodeRepository.LinkStatus pending = repository.status(codeHash, now + 1);
            assertEquals("PENDING", pending.status());
            assertNull(pending.minecraftUuid());

            LinkCodeRepository.LinkStatus claimed = repository.claim(code, first, "FirstPlayer", now + 2);
            assertEquals("CLAIMED", claimed.status());
            assertEquals(first, claimed.minecraftUuid());
            assertEquals("FirstPlayer", claimed.minecraftName());

            LinkCodeRepository.LinkStatus replay = repository.claim(code, first, "FirstPlayer", now + 3);
            assertEquals("CLAIMED", replay.status());
            assertEquals(first, replay.minecraftUuid());

            LinkCodeRepository.LinkStatus conflict = repository.claim(code, second, "SecondPlayer", now + 4);
            assertEquals("ALREADY_CLAIMED", conflict.status());
            assertEquals(first, conflict.minecraftUuid());

            repository.consume(codeHash);
            assertEquals("EXPIRED", repository.status(codeHash, now + 5).status());
        }
    }

    @Test
    void codeExpiresAfterRegisteredFiveMinuteWindow() throws Exception {
        long now = 1_800_000_000_000L;
        String code = "BCDEFGHJ";
        String codeHash = LinkCodeRepository.hash(code);

        try (LinkCodeRepository repository = new LinkCodeRepository(temp)) {
            repository.register(codeHash, now + 300_000L, now);
            assertEquals("PENDING", repository.status(codeHash, now + 299_999L).status());
            assertEquals("EXPIRED", repository.status(codeHash, now + 300_000L).status());
        }
    }
}
