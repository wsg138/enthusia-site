import {projectSnapshot} from '../../functions/lib/community/contracts.js';
import {enrichGuildBanners} from '../../functions/lib/guild-banner-source.js';
import {projectGuildDirectory} from '../../functions/lib/guild-directory-source.js';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)?value.toLowerCase():null;

// Public top-member lists prove positive membership only, never absence.
export function connectPublicGuilds(players,board,market){
  if(!Array.isArray(board?.entries)||board.entries.length>1000||!Number.isFinite(Date.parse(board.generatedAt)))throw new Error('Invalid captured guild board');
  const enriched=enrichGuildBanners(board,market),memberships=new Map();
  for(const row of enriched.entries){
    if(!uuid(row.id))continue;
    const guild=projectSnapshot('guilds',{items:[{id:row.id,name:row.name,level:row.level,banner:row.banner}]}).items[0];
    for(const member of new Set((row.topMemberUuids??[]).map(uuid).filter(Boolean))){
      const list=memberships.get(member)??[];
      if(!list.some(item=>item.id===guild.id))list.push({id:guild.id,name:guild.name,level:guild.level,banner:guild.banner});
      memberships.set(member,list);
    }
  }
  const items=players.items.map(player=>{
    if(player.guildsKnown&&!player.guildsPartial)return player;
    const guilds=memberships.get(uuid(player.id));
    return guilds?.length?{...player,guildsKnown:true,guildsPartial:true,guildMemberships:guilds}:player;
  });
  const guildDirectory={...projectGuildDirectory(enriched),generatedAt:board.generatedAt};
  return {players:{...players,items},guildDirectory:{...guildDirectory,limited:true,updatedAt:board.generatedAt,stale:Date.now()-Date.parse(board.generatedAt)>900000}};
}
