const preview=()=>document.documentElement.hasAttribute('data-preview-root');
function clone(name){return document.getElementById('exact-detail-'+name).content.cloneNode(true);}
function date(value){return value?new Date(value).toLocaleDateString('en-US',{month:'long',day:'numeric'}):'To be announced';}
export function exactDetailHead(competition){
  const node=clone('head');node.querySelector('h1').textContent=competition.title.toUpperCase();
  if(!preview()){node.querySelector('div>p:last-child').textContent=competition.config?.public?.summary??'Competition details';const id=competition.config?.appearance?.bannerImageId;if(id)node.querySelector('section').style.backgroundImage='linear-gradient(rgba(60,8,5,.3),rgba(60,8,5,.3)),url(/api/competitions/media/'+encodeURIComponent(id)+')';}
  return node;
}
export function exactDetailStage(competition,tabs){
  const node=clone('stage'),state=competition.lifecycleState,stages=['UPCOMING','SUBMISSIONS_OPEN','REVIEW','VOTING','JUDGING','COMPLETED'],index=Math.max(0,stages.indexOf(state));
  const titles=['Getting ready','Submissions open','Entries under review','Voting open','Final checks','Results published'];node.querySelector('[data-b-text="stageTitle"]').textContent=titles[index];
  node.querySelector('[data-b-text="stageDesc"]').textContent=index===0?'Read the brief and plan your entry before submissions open.':'See the competition rules and schedule for this stage.';node.querySelector('[data-b-text="nextLine"]').textContent=index===0?'Submissions open soon. The day will be announced on Discord':titles[Math.min(index+1,5)];
  node.querySelectorAll('.trk').forEach((step,i)=>{step.classList.toggle('now',i===index);if(!preview())step.querySelector('small').textContent=i===index?'Now':'See schedule';});
  const visibility={ctaEnter:state==='SUBMISSIONS_OPEN',ctaVote:state==='VOTING',ctaRes:['COMPLETED','ARCHIVED'].includes(state),ctaWait:state==='UPCOMING'};
  for(const button of node.querySelectorAll('[data-b-class]')){const key=Object.keys(visibility).find(key=>button.dataset.bClass.includes(key));if(!key)continue;button.hidden=!visibility[key];if(key==='ctaEnter')button.addEventListener('click',event=>{event.preventDefault();const entry=tabs.querySelector('[data-tab="my-submission"]');if(entry)entry.click();else location.href=new URL('../account.html',import.meta.url).href;});if(key!=='ctaEnter')button.addEventListener('click',()=>tabs.querySelector('[data-tab="'+(key==='ctaWait'?'rules':key==='ctaVote'?'vote':'results')+'"]')?.click());}
  return node;
}
export function exactDetailOverview(competition){
  const node=clone('overview');if(preview()&&competition.visualVariant==='reference')return node;
  const config=competition.config??{},panel=node.querySelector('.panel');panel.querySelector('p').textContent=config.public?.description??config.public?.summary??'';
  const facts=[config.public?.theme??'To be announced',(config.entries?.allowedTypes??[]).join(', '),'PNG or JPEG, up to 8 MB each','Sign in with Discord and link your Minecraft account'];panel.querySelectorAll(':scope>div').forEach((row,index)=>row.lastElementChild.textContent=facts[index]);
  const schedule=config.schedule??{};node.querySelectorAll('.tip>div').forEach((row,index)=>row.lastElementChild.textContent=[date(schedule.submissionsOpenAt),date(schedule.votingOpenAt),date(schedule.resultsPublishedAt)][index]);return node;
}
