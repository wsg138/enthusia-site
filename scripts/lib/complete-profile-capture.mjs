import {projectSnapshot} from '../../functions/lib/community/contracts.js';
export function connectCompleteProfileCapture(players,bundle){
  const known=new Map(players.items.map(row=>[row.id,row]));
  const stamps=[players.generatedAt,players.sourceUpdatedAt].filter(Boolean);
  if(bundle.playerGuilds){
    const source=bundle.playerGuilds;
    const data=projectSnapshot('players',{generatedAt:source.generatedAt,items:source.items.map(row=>({
      id:row.id.toLowerCase(),name:known.get(row.id.toLowerCase())?.name??'Requested player',guildsKnown:true,guildMemberships:row.guildMemberships}))});
    if(!data.generatedAt)throw new Error('Guild capture requires source date');stamps.push(data.generatedAt);
    for(const row of data.items){const player=known.get(row.id);if(player){delete player.guildsPartial;Object.assign(player,{guildsKnown:true,guildMemberships:row.guildMemberships});}}
  }
  if(bundle.players){
    const source=projectSnapshot('players',bundle.players);if(!source.generatedAt)throw new Error('Personal capture requires source date');stamps.push(source.generatedAt);
    for(const row of source.items){const player=known.get(row.id);if(!player)continue;
      if(row.achievementsKnown)Object.assign(player,{achievementsKnown:true,achievements:row.achievements});
      if(row.weeklyDuelWins)player.weeklyDuelWins=row.weeklyDuelWins;
    }
  }
  const feeds={};
  for(const kind of ['guildquests','bounties','warzone'])if(bundle[kind]){
    const source=projectSnapshot(kind,bundle[kind]);if(!source.generatedAt)throw new Error('Feed capture requires source date');
    // Keep an explicitly captured historical duel week separate from current results.
    if(kind==='warzone'&&bundle[kind].weekStartsAt){
      const start=Date.parse(bundle[kind].weekStartsAt);if(!Number.isFinite(start)||start>Date.parse(source.generatedAt))throw new Error('Invalid duel week');
      source.weekStartsAt=new Date(start).toISOString();
    }
    feeds[kind]={...source,updatedAt:source.generatedAt,capturedSnapshot:true,stale:Date.now()-Date.parse(source.generatedAt)>900000};
  }
  return {players:{...players,generatedAt:stamps.sort().at(-1),sourceUpdatedAt:stamps.sort()[0]},feeds};
}
