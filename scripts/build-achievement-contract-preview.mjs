import {readFile,writeFile} from 'node:fs/promises';
let html=await readFile('public/achievements.html','utf8');
html=html.replaceAll('href="assets/','href="../assets/').replaceAll('src="assets/','src="../assets/')
  .replaceAll('url(assets/','url(../assets/');
html=html.replace('<head>','<head>\n<meta name="robots" content="noindex,nofollow"><script src="achievement-feed-check.js"></script>');
html=html.replace(/<body([^>]*)>/,`<body$1><aside style="padding:16px;background:#fff1ce;color:#491008;border-bottom:4px solid #491008">
Simulated achievement API contract - Local only - Writes blocked
<nav style="display:flex;flex-wrap:wrap;gap:12px"><a href="?state=connected">Connected fixture</a><a href="?state=empty">Empty</a><a href="?state=stale">Stale</a><a href="?state=unavailable">Unavailable</a></nav></aside>`);
await writeFile('public/preview/achievement-feed-check.html',html);
