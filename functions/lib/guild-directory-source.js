import {projectSnapshot} from './community/contracts.js';
export function projectGuildDirectory(data){
  return projectSnapshot('guilds',{items:data.entries.map(row=>({id:row.id,name:row.name,description:row.description,level:row.level,members:row.memberCount,elo:row.seasonalElo??row.elo,prestige:row.prestige,foundedAt:row.createdAt,bankBalance:row.bankBalance,totalExperience:row.totalExperience,activityScore:row.activityScore,tag:row.tagPlain,recruiting:row.recruiting,peaceful:row.peaceful,membersList:row.membersList,banner:row.banner}))});
}
