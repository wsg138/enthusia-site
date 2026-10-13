import {readFile,writeFile} from 'node:fs/promises';
let html=await readFile('public/index.html','utf8');
html=html.replaceAll('href="assets/','href="../assets/').replaceAll('src="assets/','src="../assets/').replaceAll('url(assets/','url(../assets/');
html=html.replace('<head>','<head>\n<meta name="robots" content="noindex,nofollow"><script src="live-warzone-check.js"></script>');
html=html.replace(/<body([^>]*)>/,`<body$1><aside style="padding:16px;background:#fff1ce;color:#491008;border-bottom:4px solid #491008">
Synthetic native exporter check · Rotation/results are simulated · Writes disabled · Visible pages refresh every minute
<nav style="display:flex;flex-wrap:wrap;gap:12px"><a href="?state=connected#warzone">Connected</a><a href="?state=empty#warzone">No wins</a><a href="?state=stale#warzone">Stale</a><a href="?state=paused#warzone">Paused</a><a href="?state=unavailable#warzone">Unavailable</a></nav></aside>`);
await writeFile('public/preview/live-warzone-check.html',html);
