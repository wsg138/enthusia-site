package network.enthusia.competitions.bridge;

import org.bukkit.configuration.file.YamlConfiguration;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BridgeConfigTest {
    @Test
    void disabledDefaultsRemainLoopbackAndFailClosed() {
        BridgeConfig config = BridgeConfig.from(new YamlConfiguration(), null, null);

        assertFalse(config.server().enabled());
        assertEquals("127.0.0.1", config.server().bindHost());
        assertFalse(config.server().allowNonLoopbackBind());
        assertEquals(8765, config.server().port());
        assertEquals("", config.security().bearerToken());
        assertEquals("", config.security().hmacSecret());
        assertTrue(config.logging().rejectedRequests());
    }

    @Test
    void enabledListenerRequiresTwoDistinctLongSecrets() {
        YamlConfiguration values = new YamlConfiguration();
        values.set("server.enabled", true);

        assertThrows(IllegalArgumentException.class, () -> BridgeConfig.from(values, "short", "short"));
        String shared = "s".repeat(40);
        assertThrows(IllegalArgumentException.class, () -> BridgeConfig.from(values, shared, shared));

        BridgeConfig config = BridgeConfig.from(values, "b".repeat(40), "h".repeat(40));
        assertTrue(config.server().enabled());
    }

    @Test
    void enabledListenerRejectsNonLoopbackBindingByDefault() {
        YamlConfiguration values = new YamlConfiguration();
        values.set("server.enabled", true);
        values.set("server.bind-host", "0.0.0.0");

        IllegalArgumentException failure = assertThrows(
                IllegalArgumentException.class,
                () -> BridgeConfig.from(values, "b".repeat(40), "h".repeat(40))
        );
        assertTrue(failure.getMessage().contains("must be loopback"));
    }

    @Test
    void explicitNonLoopbackOptInPreservesConfiguredLimitsAndPrefixes() {
        YamlConfiguration values = new YamlConfiguration();
        values.set("server.enabled", true);
        values.set("server.bind-host", "0.0.0.0");
        values.set("server.allow-non-loopback-bind", true);
        values.set("server.worker-threads", 7);
        values.set("rewards.commands.allowed-prefixes", java.util.List.of(" GIVE ", "give ", "LP USER "));

        BridgeConfig config = BridgeConfig.from(values, "b".repeat(40), "h".repeat(40));

        assertEquals("0.0.0.0", config.server().bindHost());
        assertTrue(config.server().allowNonLoopbackBind());
        assertEquals(7, config.server().workerThreads());
        assertEquals(java.util.List.of("give", "lp user"), config.rewards().commandPolicy().allowedPrefixes());
    }
}
