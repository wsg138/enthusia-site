package probe;
import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
public final class Probe extends JavaPlugin {
  @Override public void onEnable() {
    Plugin bridge=Bukkit.getPluginManager().getPlugin("EnthusiaCompetitionBridge");
    Plugin provider=Bukkit.getPluginManager().getPlugin("EnthusiaAdvancements");
    provider.getConfig().set("website.public-player-completions",true);
    Bukkit.getScheduler().runTask(this, () -> {
      try {
        var method=provider.getClass().getMethod("websitePlayerAchievements",List.class);
        var row=(Map<?,?>)method.invoke(provider,List.of(UUID.fromString("00000000-0000-4000-8000-000000000001")));
        if(!List.of().equals(row.get("items"))) throw new IllegalStateException("offline player must be unknown");
        getLogger().info("PROBE provider offline exclusion PASS");
      } catch(Exception e){getLogger().severe("PROBE FAIL provider "+e);}
      Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
        try {
          var type=Class.forName("network.enthusia.competitions.bridge.PublicCommunitySources",true,bridge.getClass().getClassLoader());
          var ctor=type.getDeclaredConstructor(Plugin.class);ctor.setAccessible(true);Object source=ctor.newInstance(bridge);
          var method=type.getDeclaredMethod("readPlayers",List.class);method.setAccessible(true);
          var result=(Map<?,?>)method.invoke(source,List.of(UUID.fromString("00000000-0000-4000-8000-000000000001")));
          if(!List.of().equals(result.get("items")))throw new IllegalStateException("bridge invented player");
          getLogger().info("PROBE bridge real provider PASS");
          verifyHttp(bridge, source);
          var taskClass=Class.forName("network.enthusia.competitions.bridge.MainThreadBridge",true,bridge.getClass().getClassLoader());
          var call=taskClass.getDeclaredMethod("callCancellableRead",Plugin.class,int.class,Callable.class);call.setAccessible(true);
          AtomicBoolean ran=new AtomicBoolean();CountDownLatch blocked=new CountDownLatch(1);
          Bukkit.getScheduler().runTask(this,()->{blocked.countDown();try{Thread.sleep(250);}catch(InterruptedException e){Thread.currentThread().interrupt();}});
          if(!blocked.await(2,TimeUnit.SECONDS))throw new IllegalStateException("main thread not blocked");
          try{call.invoke(null,bridge,25,(Callable<Object>)()->{ran.set(true);return null;});throw new IllegalStateException("timeout did not occur");}
          catch(java.lang.reflect.InvocationTargetException e){if(!(e.getCause() instanceof TimeoutException))throw e;}
          Bukkit.getScheduler().runTaskLater(this,()->{if(ran.get())getLogger().severe("PROBE FAIL timeout task ran");else getLogger().info("PROBE scheduler timeout cancellation PASS");},10);
        } catch(Exception e){getLogger().severe("PROBE FAIL bridge "+e);}
      });
    });
  }
  private void verifyHttp(Plugin bridge,Object source) throws Exception {
    var loader=bridge.getClass().getClassLoader();
    var endpoint=Class.forName("network.enthusia.competitions.bridge.CommunityFeedHttpServer",true,loader);
    var sourceType=Class.forName("network.enthusia.competitions.bridge.CommunityFeedHttpServer$Source",true,loader);
    int port;
    try(var socket=new java.net.ServerSocket(0,1,java.net.InetAddress.getByName("127.0.0.1"))){port=socket.getLocalPort();}
    String token="isolated-test-token-"+"x".repeat(32);
    var constructor=endpoint.getDeclaredConstructor(int.class,String.class,sourceType);constructor.setAccessible(true);
    Object server=constructor.newInstance(port,token,source);
    var start=endpoint.getDeclaredMethod("start");start.setAccessible(true);
    var close=endpoint.getDeclaredMethod("close");close.setAccessible(true);
    try {
      start.invoke(server);
      var uri=java.net.URI.create("http://127.0.0.1:"+port+"/api/community/player-achievements?players=00000000-0000-4000-8000-000000000001");
      var client=java.net.http.HttpClient.newHttpClient();
      var denied=client.send(java.net.http.HttpRequest.newBuilder(uri).build(),java.net.http.HttpResponse.BodyHandlers.ofString());
      var allowed=client.send(java.net.http.HttpRequest.newBuilder(uri).header("Authorization","Bearer "+token).build(),java.net.http.HttpResponse.BodyHandlers.ofString());
      if(denied.statusCode()!=401||allowed.statusCode()!=200||!allowed.body().contains("\"items\":[]"))throw new IllegalStateException("Unexpected HTTP response");
      getLogger().info("PROBE authenticated HTTP real provider PASS");
    } finally {close.invoke(server);}
  }
}
