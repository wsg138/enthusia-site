package network.enthusia.competitions.bridge;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.util.List;
import java.util.Locale;
import java.util.logging.Level;

public final class CompetitionBridgePlugin extends JavaPlugin implements Listener, CommandExecutor, TabCompleter {
    private final Object runtimeLock = new Object();
    private volatile BridgeConfig runtimeConfig;
    private volatile BridgeRepository repository;
    private volatile LinkCodeRepository linkCodes;
    private volatile RewardDeliveryService rewardDelivery;
    private volatile BridgeHttpServer httpServer;
    private volatile BukkitTask itemRetryTask;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        try {
            repository = new BridgeRepository(getDataFolder().toPath());
            linkCodes = new LinkCodeRepository(getDataFolder().toPath());
            rewardDelivery = new RewardDeliveryService(this, repository);
            runtimeConfig = BridgeConfig.load(this);
            httpServer = startServer(runtimeConfig);
            scheduleItemRetries(runtimeConfig);
        } catch (Exception exception) {
            getLogger().log(Level.SEVERE, "Competition bridge failed to initialize", exception);
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        Bukkit.getPluginManager().registerEvents(this, this);
        if (getCommand("competitionbridge") != null) {
            getCommand("competitionbridge").setExecutor(this);
            getCommand("competitionbridge").setTabCompleter(this);
        }
        if (getCommand("competitionlink") != null) {
            getCommand("competitionlink").setExecutor(this);
        }
        getLogger().info("EnthusiaCompetitionBridge enabled; listener " + listenerSummary(runtimeConfig));
    }

    @Override
    public void onDisable() {
        synchronized (runtimeLock) {
            cancelItemRetryTask();
            closeQuietly(httpServer);
            httpServer = null;
            closeQuietly(linkCodes);
            linkCodes = null;
            closeQuietly(repository);
            repository = null;
            rewardDelivery = null;
            runtimeConfig = null;
        }
    }

    public boolean reloadBridge() {
        synchronized (runtimeLock) {
            BridgeConfig previous = runtimeConfig;
            BridgeHttpServer previousServer = httpServer;
            BridgeConfig candidate;
            try {
                candidate = BridgeConfig.load(this);
            } catch (Exception exception) {
                getLogger().log(Level.WARNING, "Competition bridge reload rejected; existing runtime remains active", exception);
                return false;
            }

            closeQuietly(previousServer);
            httpServer = null;
            try {
                BridgeHttpServer candidateServer = startServer(candidate);
                runtimeConfig = candidate;
                httpServer = candidateServer;
                scheduleItemRetries(candidate);
                getLogger().info("Competition bridge reloaded; listener " + listenerSummary(candidate));
                return true;
            } catch (Exception failure) {
                getLogger().log(Level.SEVERE, "Competition bridge candidate listener failed; restoring previous runtime", failure);
                try {
                    httpServer = previous == null ? null : startServer(previous);
                    runtimeConfig = previous;
                    if (previous != null) scheduleItemRetries(previous);
                } catch (Exception restoreFailure) {
                    getLogger().log(Level.SEVERE, "Previous competition bridge listener could not be restored", restoreFailure);
                    httpServer = null;
                    runtimeConfig = previous;
                }
                return false;
            }
        }
    }

    private BridgeHttpServer startServer(BridgeConfig config) throws Exception {
        if (!config.server().enabled()) return null;
        return new BridgeHttpServer(this, config, repository, linkCodes, rewardDelivery) {{ start(); }};
    }

    private void scheduleItemRetries(BridgeConfig config) {
        cancelItemRetryTask();
        long period = Math.max(100L, config.rewards().itemRetrySeconds() * 20L);
        itemRetryTask = Bukkit.getScheduler().runTaskTimer(this, () -> {
            RewardDeliveryService delivery = rewardDelivery;
            if (delivery == null) return;
            for (Player player : Bukkit.getOnlinePlayers()) delivery.attemptPendingItems(player.getUniqueId());
        }, period, period);
    }

    private void cancelItemRetryTask() {
        BukkitTask task = itemRetryTask;
        itemRetryTask = null;
        if (task != null) task.cancel();
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        RewardDeliveryService delivery = rewardDelivery;
        BridgeConfig config = runtimeConfig;
        BridgeRepository repo = repository;
        if (delivery != null) delivery.attemptPendingItems(event.getPlayer().getUniqueId());
        if (config == null || repo == null || !config.notifications().contributorLoginReminders()) return;
        try {
            for (BridgeRepository.ContributorReminder reminder : repo.contributorReminders(event.getPlayer().getUniqueId())) {
                event.getPlayer().sendMessage(BridgeHttpServer.contributorMessage(config, reminder));
            }
        } catch (Exception exception) {
            getLogger().log(Level.WARNING, "Unable to load competition contributor reminders for " + event.getPlayer().getUniqueId(), exception);
        }
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (command.getName().equalsIgnoreCase("competitionlink")) {
            return handleLinkCommand(sender, args);
        }
        if (!sender.hasPermission("enthusia.competitions.bridge.admin")) {
            sender.sendMessage(ChatColor.RED + "You do not have permission to manage the competition bridge.");
            return true;
        }
        String subcommand = args.length == 0 ? "status" : args[0].toLowerCase(Locale.ROOT);
        if (subcommand.equals("reload")) {
            boolean success = reloadBridge();
            sender.sendMessage(success
                    ? ChatColor.GREEN + "Competition bridge reloaded successfully."
                    : ChatColor.RED + "Competition bridge reload failed; the previous runtime was preserved when possible. Check console logs.");
            return true;
        }
        if (!subcommand.equals("status")) {
            sender.sendMessage(ChatColor.RED + "Usage: /competitionbridge <status|reload>");
            return true;
        }

        BridgeConfig config = runtimeConfig;
        sender.sendMessage(ChatColor.GOLD + "Enthusia Competition Bridge");
        sender.sendMessage(ChatColor.GRAY + "Listener: " + listenerSummary(config));
        if (config != null) {
            sender.sendMessage(ChatColor.GRAY + "Playtime: " + pluginState(config.integrations().playtimePlugin()));
            sender.sendMessage(ChatColor.GRAY + "LumaGuilds: " + pluginState(config.integrations().guildsPlugin()));
            sender.sendMessage(ChatColor.GRAY + "LoreItems: " + pluginState(config.integrations().loreItemsPlugin()));
            sender.sendMessage(ChatColor.GRAY + "Vault: " + pluginState("Vault"));
            sender.sendMessage(ChatColor.GRAY + "Guild submit permission: " + config.integrations().lumaGuildsSubmitPermission());
        }
        try {
            BridgeRepository.RepositoryStatus status = repository.status();
            sender.sendMessage(ChatColor.GRAY + "Ledger: " + status.deliveredRewards() + " delivered, "
                    + status.unresolvedRewards() + " unresolved, " + status.pendingItems() + " queued item rewards, "
                    + status.contributorReminders() + " contributor reminders.");
        } catch (Exception exception) {
            sender.sendMessage(ChatColor.RED + "Repository status unavailable: " + exception.getClass().getSimpleName());
        }
        return true;
    }

    private boolean handleLinkCommand(CommandSender sender, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(ChatColor.RED + "This command must be run in-game by the Minecraft account being linked.");
            return true;
        }
        if (args.length != 1) {
            player.sendMessage(ChatColor.RED + "Usage: /competitionlink <code>");
            return true;
        }
        String code = args[0].trim().toUpperCase(Locale.ROOT);
        LinkCodeRepository repo = linkCodes;
        if (repo == null) {
            player.sendMessage(ChatColor.RED + "Competition account linking is temporarily unavailable.");
            return true;
        }
        try {
            LinkCodeRepository.LinkStatus result = repo.claim(
                    code,
                    player.getUniqueId(),
                    player.getName(),
                    System.currentTimeMillis()
            );
            switch (result.status()) {
                case "CLAIMED" -> player.sendMessage(ChatColor.GREEN + "Link code accepted. Return to the Enthusia website to finish linking this account.");
                case "EXPIRED" -> player.sendMessage(ChatColor.RED + "That link code is expired or does not exist. Generate a new code on the website.");
                case "ALREADY_CLAIMED" -> player.sendMessage(ChatColor.RED + "That link code was already claimed by another Minecraft account.");
                case "INVALID" -> player.sendMessage(ChatColor.RED + "That link code is invalid. Codes are eight characters.");
                default -> player.sendMessage(ChatColor.RED + "The link could not be completed. Generate a new code and try again.");
            }
        } catch (Exception exception) {
            getLogger().log(Level.WARNING, "Minecraft competition link claim failed for " + player.getUniqueId(), exception);
            player.sendMessage(ChatColor.RED + "Competition account linking is temporarily unavailable.");
        }
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (!command.getName().equalsIgnoreCase("competitionbridge") || args.length != 1) return List.of();
        String prefix = args[0].toLowerCase(Locale.ROOT);
        return List.of("status", "reload").stream().filter(value -> value.startsWith(prefix)).toList();
    }

    private String pluginState(String pluginName) {
        Plugin plugin = Bukkit.getPluginManager().getPlugin(pluginName);
        if (plugin == null) return "not installed";
        return plugin.isEnabled() ? "enabled" : "disabled";
    }

    private static String listenerSummary(BridgeConfig config) {
        if (config == null) return "not initialized";
        return config.server().enabled() ? config.server().bindHost() + ":" + config.server().port() : "disabled by config";
    }

    private static void closeQuietly(AutoCloseable value) {
        if (value == null) return;
        try { value.close(); } catch (Exception ignored) {}
    }
}
