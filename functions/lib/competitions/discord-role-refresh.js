const SNOWFLAKE=/^\d{16,22}$/;

/** Refresh only the authenticated user's roles; never accept roles from a client. */
export async function refreshDiscordRoleSnapshot(session,env,fetchImpl=fetch,now=Date.now()) {
  const user=String(session?.discord?.id??''),guild=String(env?.DISCORD_GUILD_ID??'');
  const token=String(env?.ENTHUSIA_SITE_DISCORD_BOT_TOKEN??env?.COMPETITIONS_DISCORD_BOT_TOKEN??'').trim();
  if(!SNOWFLAKE.test(user)||!SNOWFLAKE.test(guild)||token.length<50||token.length>256||!/^[A-Za-z0-9._-]+$/.test(token))
    throw new Error('Discord staff roles must be refreshed by signing in again');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
  let membership;
  try {
    const response=await fetchImpl(`https://discord.com/api/v10/guilds/${guild}/members/${user}`,{
      headers:{authorization:`Bot ${token}`},redirect:'error',signal:controller.signal});
    if(response.status===404)membership={member:false,roleIds:[]};
    else {
      if(!response.ok)throw new Error('Discord membership unavailable');
      const body=await response.json();
      if(body?.user?.id!==user||!Array.isArray(body.roles)||body.roles.length>1000
          ||!body.roles.every(value=>typeof value==='string'&&SNOWFLAKE.test(value)))
        throw new Error('Invalid Discord membership response');
      membership={member:true,roleIds:[...new Set(body.roles)]};
    }
  } catch {
    throw new Error('Discord staff roles could not be verified; sign in again');
  } finally { clearTimeout(timeout); }
  const checkedAt=new Date(now).toISOString();
  const saved=await env.COMPETITIONS_DB.prepare(`UPDATE competition_discord_accounts
    SET guild_role_ids_json=?, updated_at=? WHERE discord_user_id=? AND updated_at=?`)
    .bind(JSON.stringify(membership),checkedAt,user,session.discordRolesCheckedAt).run();
  if(Number(saved?.meta?.changes)!==1)throw new Error('Discord membership changed; retry the request');
  return Object.freeze({...session,discordGuildMember:membership.member,
    guildRoleIds:Object.freeze(membership.roleIds),discordRolesCheckedAt:checkedAt});
}
