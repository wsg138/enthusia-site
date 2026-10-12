(function () {
/* Explicit preview-only sample service. Production pages never load this file. */
const nativeFetch = window.fetch.bind(window);
const root = new URL('./', document.currentScript.src);
const assets = new URL('../assets/', root);
let dataset, market;
const ready = Promise.all([
  nativeFetch(new URL('data.json', root)).then(r => r.json()),
  nativeFetch(new URL('market/sample-market-snapshot.json', assets)).then(r => r.json())
]).then(values => { [dataset, market] = values; market = { ...market, schemaVersion:1,serverId:"enthusia-main",sequence:1,snapshotRevision:1 }; for(const stall of market.stalls){if(stall.owner.avatar?.kind === "MINECRAFT_HEAD")stall.owner.avatarUrl=null;if(stall.owner.type==="GUILD"){stall.owner.avatar={kind:"GUILD_BANNER",banner:{baseColor:"BLUE",patterns:[]}};stall.owner.avatarUrl=null;}} });
const persona = sessionStorage.getItem('enthusia-preview-persona') || 'player';
const staff = persona === 'staff';
const playerId = '123e4567-e89b-42d3-a456-426614174000';
const discordId = '6'.repeat(18);
const account = { uuid:playerId,name:'PreviewPlayer' };
const session = { authenticated:persona!=='visitor', discord:{id:discordId,username:staff?'PreviewStaff':'PreviewPlayer',globalName:staff?'Preview staff':'Preview player'}, discordGuildMember:true, linkedMinecraftAccounts:[account], minecraft:account, staff:{review:staff,manage:staff,appeals:staff,competitions:staff}, websiteAccountId:playerId };
const punishment = {player:'PreviewPlayer',punishmentType:'MUTE',broadReason:'CHAT',publicReason:'Sample moderation record',issuedAt:'2026-10-10T12:00:00Z',expiresAt:null,state:'ACTIVE',caseId:'01K0000000000000',remainingSeconds:null,appealAvailable:true};
const eligible = {id:'123e4567-e89b-42d3-a456-426614174099',...punishment,type:'MUTE',reason:'Sample moderation record',eligible:true};
const submissions = ['Town Hall','Garden Plaza','Market Courtyard'].map((title,i)=>({id:'123e4567-e89b-42d3-a456-42661417420'+i,title,description:'A sample community build with gathering spaces and paths.',ownerName:'PreviewPlayer',ownerUuid:playerId,entryType:'SOLO',status:'APPROVED',participants:[{playerName:'PreviewPlayer',playerUuid:playerId,role:'OWNER'}],images:[],coverImageUrl:new URL('screenshots/slide-0'+(i+1)+'.webp',assets).href}));
const details = slug => {
  const competition=dataset.competitions.find(c=>c.slug===slug)||dataset.referenceCompetitions.find(c=>c.slug===slug)||dataset.competitions[0];
  const completed=competition.lifecycleState==='COMPLETED';
  return {competition,entriesVisible:['VOTING','COMPLETED'].includes(competition.lifecycleState),submissions,judges:[{name:'PreviewJudge',playerName:'PreviewJudge'}],results:completed?submissions.map((s,i)=>({submissionId:s.id,title:s.title,placement:i+1,finalScore:10-i,communityComponent:9-i,judgeComponent:10-i,judgeScoreCount:1})):[],competitionResults:[]};
};
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const routes = new Map([
  ['/api/competitions/auth/session', () => json(session)],
  ['/api/reviewer/session', () => json({appeals:staff,competitions:staff})],
  ['/api/appeals/turnstile', () => json({siteKey:'preview',action:'appeal'})],
  ['/api/appeals/eligible', () => json({punishments:session.authenticated?[eligible]:[]})],
  ['/api/appeals/bindings', () => json({bindings:[]})],
  ['/api/events/schedule', () => json({physicalEvents:{nextVoteAt:'2026-10-18T16:00:00Z',nextEventAt:'2026-10-18T17:00:00Z'},chatEvents:{nextChatEventAt:'2026-10-12T17:00:00Z'}})],
  ['/api/events/stats', () => json({topWins:[{player:'PreviewPlayer',wins:4}],recentEvents:[]})],
  ['/api/gallery/session', () => json({...session,staff:{review:staff,manage:staff}})],
  ['/api/competitions', () => json({competitions:document.body.hasAttribute?.('data-exact-catalog')?dataset.referenceCompetitions:dataset.competitions})],
  ['/api/competitions/invites', () => json({invites:[]})],
  ['/api/competitions/admin/status', () => json({ok:true,environment:'preview',database:{bound:true,schemaReady:true},media:{bound:true},moderation:{configured:true},identity:{discordOAuthConfigured:true},bridge:{configured:true},notifications:{discordStaffConfigured:true},siteOrigin:{configured:true},features:{enabled:true,publicCatalog:true}})],
  ['/api/competitions/admin', () => staff ? json({competitions:dataset.competitions}) : json({error:'forbidden'},403)]
]);
function adminPreview(pathname) {
  if(!staff)return json({error:'forbidden'},403);
  const collections=new Map([['audit',{events:[]}],['submissions',{submissions}],['judges',{judges:[]}],['rewards',{rewards:[]}],['flags',{flags:[]}]]);
  const value=collections.get(pathname.split('/').at(-1));
  if(value)return json(value);
  return json({competition:{...dataset.competitions[0],config:dataset.adminConfig},publishReadiness:[]});
}
function competitionPreview(pathname) {
  const action=pathname.split('/')[4];
  if(!action)return json(details(pathname.split('/')[3]));
  if(action==='me')return session.authenticated ? json({selectedPlayer:account,activeMinutes:360,canSubmit:true,canVote:true,allowedEntryTypes:['SOLO','GROUP','GUILD'],linkedMinecraftAccounts:[account],guilds:[]}) : json({error:'authentication_required'},401);
  const data=new Map([['vote',{eligible:true,votesPerVoter:2,selections:[]}],['ballot',{eligible:true,votesPerVoter:2,selections:[]}],['submissions',{submissions:[]}]]);
  return data.has(action)?json(data.get(action)):json({error:'preview_unavailable'},404);
}
const groups = [
  [path=>path.startsWith('/api/reviewer/appeals'),()=>staff?json({appeals:[]}):json({error:'forbidden'},403)],
  [path=>path.startsWith('/api/appeals'),()=>session.authenticated?json({appeals:[],attachments:[]}):json({error:'authentication_required'},401)],
  [path=>path.startsWith('/api/moderation/cases/')||path.startsWith('/api/punishments/cases/'),()=>json(punishment)],
  [path=>path.startsWith('/api/moderation')||path.startsWith('/api/punishments'),()=>json({items:[punishment],nextCursor:null})],
  [path=>path.startsWith('/api/leaderboards/'),()=>json({players:['PreviewPlayer','BuilderTwo','Mapartist'].map((username,i)=>({username,formattedValue:String(300-i*50)}))})],
  [path=>path.startsWith('/api/gallery'),()=>json({submissions:submissions.map(entry=>({...entry,category:'COMMUNITY_BUILDS',previewUrl:entry.coverImageUrl,imageUrl:entry.coverImageUrl})),categories:[]})],
  [path=>path.startsWith('/api/competitions/admin/'),adminPreview],
  [path=>path.startsWith('/api/competitions/'),competitionPreview]
];
function previewApi(url) {
  if(url.pathname.startsWith('/api/community/')){
    const parts=url.pathname.slice('/api/community/'.length).split('/');
    if(parts[0]==='warzone'){
      const state=new URL(location.href).searchParams.get('warzone-state')??'captured';
      if(state==='captured'||state==='last-week')return nativeFetch(new URL('warzone-server-snapshot.json',root)).then(response=>{if(!response.ok)throw new Error('Captured snapshot unavailable');return response.json();}).then(snapshot=>json(snapshot.weeks[state==='last-week'?snapshot.previousWeek:snapshot.currentWeek]));
      if(state==='unavailable')return json({error:'community_service_unavailable'},503);
      const monday=new Date();monday.setUTCHours(0,0,0,0);monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
      const endsAt=new Date(Date.now()+3600000).toISOString();
      const items=[{id:'current-meta',type:'kit',name:'Sample · Grounded',description:'Wind charges and spears are disabled. Temporary cobwebs: not allowed.',endsAt},{id:'next-meta',type:'activity',name:'Next meta',description:'Sample · Cobweb Combat begins at '+endsAt},{id:'duels-status',type:'activity',name:'Weekly duel wins',description:state==='empty'?'No counted WarzoneDuels match wins recorded this week.':'Counted WarzoneDuels match wins since '+monday.toISOString()+' (UTC Monday week).'}];
      if(state!=='empty')items.push(...['PreviewPlayer','BuilderTwo','Mapartist'].map((name,i)=>({id:'duels-'+i,type:'leader',name,wins:12-i*4})));
      return json({items,updatedAt:new Date(Date.now()-(state==='stale'?1800000:0)).toISOString(),stale:state==='stale'});
    }
    if(parts[0]==='admin'){
      if(!staff)return json({error:'editor_role_required'},403);
      if(parts[1]==='session')return json({editor:true,name:'Fain',rank:'Founder'});
      return json(parts[1]==='news'?{items:dataset.community.news.items,editorDraft:dataset.community.editorDraft}:dataset.community[parts[1]]??{items:[]});
    }
    if(parts[0]==='polls'&&parts[1])return json({poll:dataset.community.polls.items[0],choice:null,totals:null});
    if(parts[0]==='market-design')return json(dataset.community.marketDesign);
    if(parts[0]==='alerts')return json({items:[]});
    if(parts[0]==='insights')return json({...dataset.community.insights,week:(url.searchParams.get('week')||'2026-10-05')+'T00:00:00Z',mode:url.searchParams.get('mode')||'stall'});
    return json(dataset.community[parts[0]]??{items:[]});
  }
  if(url.pathname==='/api/punishments'&&document.body.hasAttribute?.('data-exact-punishments')){const values=['BAN','MUTE','WARN','BAN'].map((type,index)=>({...punishment,punishmentType:type,designIndex:index}));return json({items:values.filter(row=>!url.searchParams.get('type')||url.searchParams.get('type')==='ALL'||row.punishmentType===url.searchParams.get('type')),nextCursor:null});}
  const route=routes.get(url.pathname);
  if(route)return route(url);
  for(const [matches,render] of groups)if(matches(url.pathname))return render(url.pathname);
  return json({error:'preview_unavailable'},404);
}
window.fetch = async (input,options={}) => {
  const url=new URL(input instanceof Request?input.url:String(input),location.href);
  if(url.hostname==='market-api.enthusia.info'){await ready;return json(market);}
  if(!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
  await ready;
  const method=options.method||(input instanceof Request?input.method:'GET');
  if(method!=='GET')return json({error:'preview_actions_are_not_saved'},501);
  return previewApi(url);
};
window.turnstile={render(container,options){container.textContent='Preview verification';queueMicrotask(()=>options.callback('preview-only'));return 'preview';},reset(){},remove(){}};
window.WebSocket=class {constructor(){this.readyState=0;}addEventListener(){}removeEventListener(){}close(){this.readyState=3;}send(){}};
const banner=document.createElement('aside');banner.className='preview-banner';banner.setAttribute('aria-label','Preview controls');
const label=document.createElement('strong');label.textContent='Combined preview';const note=document.createElement('span');note.textContent='Sample data · actions are not saved';
const select=document.createElement('select');select.setAttribute('aria-label','Preview persona');for(const role of ['visitor','player','staff']){const opt=new Option(role.charAt(0).toUpperCase()+role.slice(1),role);opt.selected=role===persona;select.append(opt);}select.addEventListener('change',()=>{sessionStorage.setItem('enthusia-preview-persona',select.value);location.reload();});
banner.append(label,note,select);if(document.body)document.body.prepend(banner);else document.addEventListener("DOMContentLoaded",()=>document.body.prepend(banner),{once:true});
document.addEventListener('DOMContentLoaded',()=>{if(!document.getElementById('warzone'))return;const selector=document.createElement('select');selector.setAttribute('aria-label','Warzone preview state');const current=new URL(location.href).searchParams.get('warzone-state')??'captured';if(['captured','last-week'].includes(current))note.textContent='Warzone: captured real server data · Other sections: sample data · Actions are not saved';for(const [value,label]of [['captured','Server snapshot: current week'],['last-week','Server snapshot: last week'],['ready','Sample: connected'],['empty','Sample: no wins'],['stale','Sample: stale'],['unavailable','Sample: unavailable']]){const option=new Option(label,value);option.selected=value===current;selector.append(option);}selector.addEventListener('change',()=>{const url=new URL(location.href);url.searchParams.set('warzone-state',selector.value);url.hash='warzone';location.href=url.href;});banner.append(selector);},{once:true});
document.addEventListener('click',event=>{
  const a=event.target.closest?.('a[href]');if(!a)return;
  const url=new URL(a.href);
  if(url.pathname.startsWith('/api/')) {event.preventDefault();sessionStorage.setItem('enthusia-preview-persona','player');location.reload();return;}
  if(url.origin===location.origin&&url.pathname.startsWith('/')&&!url.pathname.startsWith(root.pathname))a.href=new URL(url.pathname.slice(1)+url.search+url.hash,root).href;
},true);

})();
