package network.enthusia.competitions.bridge;

import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;

import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

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
}
