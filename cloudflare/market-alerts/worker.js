/* Opt-in linked-account DMs. Separate disabled-by-default deployment. */
export async function dispatchAlerts(env,send=fetch,now=new Date()){
  const token=[env.ENTHUSIA_SITE_DISCORD_BOT_TOKEN,env.COMPETITIONS_DISCORD_BOT_TOKEN,env.DISCORD_BOT_TOKEN].map(value=>String(value??'').trim()).find(Boolean);
  if(env.MARKET_ALERTS_ENABLED!=='true'||!env.COMMUNITY_DB||!token)return {sent:0,enabled:false};
  const db=env.COMMUNITY_DB,cutoff=new Date(now.getTime()-3600000).toISOString(),recent=new Date(now.getTime()-86400000).toISOString();
  const rows=(await db.prepare(`SELECT a.subscriber,a.item,a.threshold,SUM(s.gold)/SUM(s.quantity) AS price FROM market_alerts a
    JOIN market_sales s ON a.item=s.item AND s.occurred_at>=?
    WHERE a.last_attempt_at IS NULL OR a.last_attempt_at<? GROUP BY a.subscriber,a.item HAVING price<=a.threshold LIMIT 25`).bind(recent,cutoff).all()).results;
  let sent=0;
  const headers={authorization:'Bot '+token,'content-type':'application/json'};
  for(const row of rows){
    if(!/^\d{16,22}$/.test(row.subscriber))continue;
    const claim=await db.prepare('UPDATE market_alerts SET last_attempt_at=? WHERE subscriber=? AND item=? AND (last_attempt_at IS NULL OR last_attempt_at<?)').bind(now.toISOString(),row.subscriber,row.item,cutoff).run();
    if(!claim.meta.changes)continue;
    try{
      const dm=await send('https://discord.com/api/v10/users/@me/channels',{method:'POST',headers,body:JSON.stringify({recipient_id:row.subscriber})});
      if(dm.status===429)break;if(!dm.ok)continue;const channel=await dm.json();if(!/^\d{16,22}$/.test(channel.id??''))continue;
      const stillSubscribed=await db.prepare('SELECT threshold FROM market_alerts WHERE subscriber=? AND item=?').bind(row.subscriber,row.item).first();
      if(!stillSubscribed||row.price>stillSubscribed.threshold)continue;
      const message=await send(`https://discord.com/api/v10/channels/${channel.id}/messages`,{method:'POST',headers,body:JSON.stringify({content:`Enthusia price alert: ${row.item} is averaging ${Number(row.price).toFixed(2)} raw gold per item over the last 24 hours. Manage this alert at https://enthusia.info/market.html#item=${encodeURIComponent(row.item)}`,allowed_mentions:{parse:[]}})});
      if(message.status===429)break;if(!message.ok)continue;
      await db.prepare('UPDATE market_alerts SET last_sent_at=? WHERE subscriber=? AND item=?').bind(now.toISOString(),row.subscriber,row.item).run();sent++;
    }catch{/* Keep the attempt cooldown; retry on a later scheduled run. */}
  }return {sent,enabled:true};
}
export default {async scheduled(_event,env,context){context.waitUntil(dispatchAlerts(env));},fetch(){return new Response('Not found',{status:404});}};
