package network.enthusia.competitions.bridge;

import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class MainThreadBridgeTest {
    @Test void timedOutQueuedReadDoesNotRunLater() {
        var ran = new AtomicBoolean();
        var pending = new FutureTask<>(() -> { ran.set(true); return "result"; });
        assertThrows(TimeoutException.class, () -> MainThreadBridge.awaitRead(pending, 1));
        pending.run();
        assertTrue(pending.isCancelled());
        assertFalse(ran.get());
    }

    @Test void completedReadReturnsItsValue() throws Exception {
        var pending = new FutureTask<>(() -> "result");
        pending.run();
        assertEquals("result", MainThreadBridge.awaitRead(pending, 100));
    }
}
