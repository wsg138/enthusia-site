import {projectSnapshot} from '../../functions/lib/community/contracts.js';
export function validateProfileImport(input){
  if(input?.kind!=='local_profile_import')throw new Error('Invalid local import envelope');
  const players=projectSnapshot('players',input.players);if(!players.generatedAt)throw new Error('Missing profile capture date');
  const date=players.sourceUpdatedAt??players.generatedAt;
  const feeds={};
  for(const [kind,value]of Object.entries(input.feeds??{})){
    if(!['guilds','achievements','guildquests','bounties','warzone'].includes(kind))throw new Error('Unsupported import feed');
    const feed=projectSnapshot(kind,value);if(!feed.generatedAt)throw new Error('Missing feed capture date');
    feeds[kind]={...feed,updatedAt:feed.generatedAt,capturedSnapshot:true,stale:Date.now()-Date.parse(feed.generatedAt)>900000};
    if(kind==='warzone'&&value.weekStartsAt){const start=Date.parse(value.weekStartsAt);if(!Number.isFinite(start)||start>Date.parse(feed.generatedAt))throw new Error('Invalid duel week');feeds[kind].weekStartsAt=new Date(start).toISOString();}
  }
  return {kind:'local_profile_import',players:{...players,updatedAt:date,stale:Date.now()-Date.parse(date)>900000},feeds};
}
export function connectCompleteProfileCapture(players,bundle){
  const base=projectSnapshot('players',{...players,items:players.items.map(row=>({...row,id:row.id.toLowerCase()}))});
  if(!base.generatedAt)throw new Error('Public profiles require a source date');
  players={...base,stale:players.stale===true,updatedAt:base.sourceUpdatedAt??base.generatedAt};
  const known=new Map(players.items.map(row=>[row.id,row]));
  const stamps=[players.generatedAt,players.sourceUpdatedAt].filter(Boolean);
  if(bundle.playerGuilds){
    const source=bundle.playerGuilds;
    const data=projectSnapshot('players',{generatedAt:source.generatedAt,items:source.items.map(row=>{
      const id=row.id.toLowerCase();if(!known.has(id))throw new Error('Unexpected player identity in guild capture');
      return {id,name:known.get(id).name,guildsKnown:true,guildMemberships:row.guildMemberships};})});
    if(!data.generatedAt)throw new Error('Guild capture requires source date');stamps.push(data.generatedAt);
    for(const row of data.items){const player=known.get(row.id);if(player){delete player.guildsPartial;Object.assign(player,{guildsKnown:true,guildMemberships:row.guildMemberships});}}
  }
  if(bundle.players){
    const source=projectSnapshot('players',{...bundle.players,items:bundle.players.items.map(row=>({...row,id:row.id.toLowerCase()}))});if(!source.generatedAt)throw new Error('Personal capture requires source date');stamps.push(source.generatedAt);
    for(const row of source.items)if(!known.has(row.id))throw new Error('Unexpected player identity in personal capture');
    if(bundle.players.requestedPlayerIds){
      if(bundle.players.scope!=='registered_renderer_projection'||!Array.isArray(bundle.players.requestedPlayerIds)||bundle.players.requestedPlayerIds.length>1000)throw new Error('Invalid completion request scope');
      const ids=bundle.players.requestedPlayerIds.map(id=>id.toLowerCase());if(new Set(ids).size!==ids.length)throw new Error('Duplicate completion request');
      if(source.items.some(row=>!ids.includes(row.id)))throw new Error('Completion row outside requested identities');
      for(const id of ids){const player=known.get(id);if(!player)throw new Error('Unexpected requested identity');delete player.achievementsKnown;player.achievements=[];}
    }
    for(const row of source.items){const player=known.get(row.id);if(!player)continue;
      if(row.achievementsKnown)Object.assign(player,{achievementsKnown:true,achievements:row.achievements});
      if(row.weeklyDuelWins)player.weeklyDuelWins=row.weeklyDuelWins;
    }
  }
  const feeds={};
  for(const kind of ['guilds','achievements','guildquests','bounties','warzone'])if(bundle[kind]){
    const source=projectSnapshot(kind,bundle[kind]);if(!source.generatedAt)throw new Error('Feed capture requires source date');
    // Keep an explicitly captured historical duel week separate from current results.
    if(kind==='warzone'&&bundle[kind].weekStartsAt){
      const start=Date.parse(bundle[kind].weekStartsAt);if(!Number.isFinite(start)||start>Date.parse(source.generatedAt))throw new Error('Invalid duel week');
      source.weekStartsAt=new Date(start).toISOString();
    }
    feeds[kind]={...source,updatedAt:source.generatedAt,capturedSnapshot:true,stale:Date.now()-Date.parse(source.generatedAt)>900000};
  }
  const sourceUpdatedAt=stamps.sort()[0];
  return {players:{...players,generatedAt:stamps.at(-1),sourceUpdatedAt,updatedAt:sourceUpdatedAt,stale:Date.now()-Date.parse(sourceUpdatedAt)>900000},feeds};
}
