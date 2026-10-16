import com.google.gson.*;
import java.nio.file.*;
import java.sql.*;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

class ExportProfileWins {
 public static void main(String[] args) throws Exception {
  if(args.length!=4)throw new IllegalArgumentException("Provide captured H2 base path, capture-date file, public profiles JSON and output JSON");
  Instant captured=Instant.parse(Files.readString(Path.of(args[1])).trim());
  Instant start=captured.atZone(ZoneOffset.UTC).toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).atStartOfDay(ZoneOffset.UTC).toInstant();
  Map<String,Long> totals=new HashMap<>();
  try(var db=DriverManager.getConnection("jdbc:h2:file:"+args[0]+";ACCESS_MODE_DATA=r;IFEXISTS=TRUE;FILE_LOCK=NO")){
   try(var statement=db.prepareStatement("SELECT winner_id, COUNT(*) FROM duel_records WHERE counted_as_match = TRUE AND end_reason <> 'DRAW' AND winner_id IS NOT NULL AND winner_id <> '' AND ended_at >= ? AND ended_at < ? GROUP BY winner_id")){
    statement.setLong(1,start.toEpochMilli());statement.setLong(2,captured.toEpochMilli());
    try(var rows=statement.executeQuery()){while(rows.next())totals.put(UUID.fromString(rows.getString(1)).toString(),rows.getLong(2));}
   }
  }
  var source=JsonParser.parseString(Files.readString(Path.of(args[2]))).getAsJsonObject().getAsJsonArray("items");
  if(source.size()>1000)throw new IllegalArgumentException("Public profile capture exceeds 1000 records");
  List<Map<String,Object>> players=new ArrayList<>();
  var identities=new HashSet<String>();
  for(var element:source){var player=element.getAsJsonObject();String id=UUID.fromString(player.get("id").getAsString()).toString();
   if(!identities.add(id))throw new IllegalArgumentException("Duplicate public identity");
   players.add(Map.of("id",id,"name",player.get("name").getAsString(),"weeklyDuelWins",Map.of("wins",totals.getOrDefault(id,0L),"weekStartsAt",start.toString(),"capturedAt",captured.toString())));
  }
  Files.writeString(Path.of(args[3]),new Gson().toJson(Map.of("generatedAt",captured.toString(),"items",players)));
  System.out.println("Read-only captured weekly totals for "+players.size()+" profiles; winners in full source: "+totals.size());
 }
}
