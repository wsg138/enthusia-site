package network.enthusia.competitions.bridge;

import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;

import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

final class MainThreadBridge {
    private MainThreadBridge() {}

    static <T> T call(Plugin plugin, int timeoutMs, Callable<T> callable) throws Exception {
        if (Bukkit.isPrimaryThread()) return callable.call();
        try {
            return Bukkit.getScheduler().callSyncMethod(plugin, callable).get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (ExecutionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof Exception checked) throw checked;
            if (cause instanceof Error error) throw error;
            throw new IllegalStateException(cause);
        }
    }

    // Read-only requests may be cancelled before execution when their caller has gone away.
    // Cancellation cannot interrupt work already running on the server thread.
    static <T> T callCancellableRead(Plugin plugin, int timeoutMs, Callable<T> callable) throws Exception {
        if (Bukkit.isPrimaryThread()) return callable.call();
        return awaitRead(Bukkit.getScheduler().callSyncMethod(plugin, callable), timeoutMs);
    }

    static <T> T awaitRead(Future<T> pending, int timeoutMs) throws Exception {
        try {
            return pending.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException | InterruptedException exception) {
            pending.cancel(false);
            throw exception;
        } catch (ExecutionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof Exception checked) throw checked;
            if (cause instanceof Error error) throw error;
            throw new IllegalStateException(cause);
        }
    }
}
