import com.google.gson.Gson;
import com.lincoln.maceguard.website.PublicWarzoneSnapshot;
import com.lincoln.maceguard.website.WebsiteSignedExport;
import dev.minecraft.warzoneduels.adapter.bukkit.persistence.WeeklyWinsQuery;
import java.nio.file.*;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.*;

/** Synthetic contract only. Uses actual built exporters; performs no HTTP requests. */
class ExportLiveWarzoneContract {
    public static void main(String[] args) throws Exception {
        long now=System.currentTimeMillis(),week=PublicWarzoneSnapshot.weekStart(now);
        try(var connection=DriverManager.getConnection("jdbc:h2:mem:websitecontract")) {
            try(var statement=connection.createStatement()) {
                statement.execute("CREATE TABLE duel_records(reference VARCHAR,winner_id VARCHAR,winner_name VARCHAR,ended_at BIGINT,counted_as_match BOOLEAN,end_reason VARCHAR,team_size INT)");
                statement.execute("CREATE TABLE duel_record_participants(duel_reference VARCHAR,player_id VARCHAR,player_name VARCHAR,winner BOOLEAN)");
                statement.execute("INSERT INTO duel_records VALUES ('team','00000000-0000-4000-8000-000000000001','FixtureOne',"+now+",TRUE,'KILL',2)");
                statement.execute("INSERT INTO duel_record_participants VALUES ('team','00000000-0000-4000-8000-000000000001','FixtureOne',TRUE),('team','00000000-0000-4000-8000-000000000002','FixtureTwo',TRUE),('team','00000000-0000-4000-8000-000000000003','PrivateOpponent',FALSE)");
            }
            var results=WeeklyWinsQuery.snapshot(connection,week,now+1);
            var rotation=Map.<String,Object>of("kind","warzone","generatedAt",Instant.ofEpochMilli(now).toString(),
                    "items",List.of(Map.of("id","current-meta","type","kit","name","Elytra, No Rockets","description","Rocket boosts blocked","manualOverride",true,"endsAt",Instant.ofEpochMilli(now+86400000).toString()),
                    Map.of("id","next-meta","type","activity","name","Vanilla","description","")));
            String body=new Gson().toJson(PublicWarzoneSnapshot.withLeaders(rotation,results));
            var request=WebsiteSignedExport.request(WebsiteSignedExport.endpoint("https://enthusia.info/api/community/ingest"),"k".repeat(32),body,now,"synthetic-contract-0001");
            var fixture=Map.of("body",body,"headers",request.headers().map());
            Files.writeString(Path.of(args[0]),new Gson().toJson(fixture));
            System.out.println("Synthetic native H2 team results -> MaceGuard signed contract exported; no network call.");
        }
    }
}
