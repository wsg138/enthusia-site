const COOKIE='__Host-enthusia_oauth_state';
const TOKEN=/^[A-Za-z0-9_-]{43}$/;

export function oauthBrowserCookie(state) {
  if(!TOKEN.test(state))throw new TypeError('Invalid OAuth transaction');
  return `${COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
}
export function clearOauthBrowserCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
export function oauthBrowserMatches(request,state) {
  if(typeof state!=='string'||!TOKEN.test(state))return false;
  const matches=(request.headers.get('cookie')??'').split(';')
    .map(part=>part.trim()).filter(part=>part.startsWith(COOKIE+'='));
  return matches.length===1&&matches[0]===COOKIE+'='+state;
}
export function oauthRedirect(location,cookie=null,status=303) {
  const headers=new Headers({location,'cache-control':'no-store','referrer-policy':'no-referrer'});
  if(cookie)headers.append('set-cookie',cookie);
  return new Response(null,{status,headers});
}
