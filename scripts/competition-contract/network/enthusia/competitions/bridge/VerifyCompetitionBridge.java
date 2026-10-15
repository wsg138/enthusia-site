package network.enthusia.competitions.bridge;

import network.enthusia.competitions.bridge.libs.gson.JsonObject;
import network.enthusia.competitions.bridge.libs.gson.JsonParser;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

/** Local contract only: no Bukkit runtime, provider calls, rewards or messages. */
public final class VerifyCompetitionBridge {
    public static void main(String[] args) throws Exception {
        var requests=JsonParser.parseString(Files.readString(Path.of(args[0]))).getAsJsonArray();
        var dataFolder=Path.of(args[1]);
        var security=new BridgeConfig.Security("b".repeat(48),"h".repeat(48),90,300);
        for(var item:requests) {
            var row=item.getAsJsonObject();
            var values=row.getAsJsonObject("headers");
            var headers=new RequestAuthenticator.Headers(text(values,"authorization"),
                    text(values,"x-enthusia-timestamp"),text(values,"x-enthusia-nonce"),
                    text(values,"x-enthusia-content-sha256"),text(values,"x-enthusia-signature"));
            var clock=Clock.fixed(Instant.ofEpochMilli(Long.parseLong(headers.timestamp())),ZoneOffset.UTC);
            var body=text(row,"body").getBytes(StandardCharsets.UTF_8);
            var method=text(row,"method");
            var path=text(row,"path");
            try(var repository=new BridgeRepository(dataFolder)) {
                var authenticator=new RequestAuthenticator(security,repository,clock);
                rejected(authenticator.verify(method,path,(text(row,"body")+" ").getBytes(StandardCharsets.UTF_8),headers),"content_hash_mismatch");
                rejected(authenticator.verify(method,path+"/changed",body,headers),"invalid_signature");
                rejected(authenticator.verify(method,path,body,new RequestAuthenticator.Headers(null,
                        headers.timestamp(),headers.nonce(),headers.contentHash(),headers.signature())),"invalid_bearer");
                var stale=new RequestAuthenticator(security,repository,Clock.offset(clock,java.time.Duration.ofMinutes(2)));
                rejected(stale.verify(method,path,body,headers),"stale_request");
                if(!authenticator.verify(method,path,body,headers).accepted())throw new AssertionError("Website signature rejected");
                rejected(authenticator.verify(method,path,body,headers),"replayed_nonce");
            }
            try(var reopened=new BridgeRepository(dataFolder)) {
                rejected(new RequestAuthenticator(security,reopened,clock).verify(method,path,body,headers),"replayed_nonce");
            }
        }
        System.out.println("Verified "+requests.size()+" real website signatures with the native bridge; tamper, path, bearer, stale and durable replay checks passed. Synthetic local data only; no delivery.");
    }
    private static String text(JsonObject value,String key) { return value.get(key).getAsString(); }
    private static void rejected(RequestAuthenticator.Result result,String reason) {
        if(result.accepted()||!reason.equals(result.error()))throw new AssertionError("Expected rejection: "+reason);
    }
}
