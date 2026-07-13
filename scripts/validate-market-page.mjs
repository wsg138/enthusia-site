import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9666;
const profile = path.resolve("dist/chrome-market-profile");
const client = path.resolve("dist/client").replaceAll("\\", "/");
const siteBaseUrl = process.env.SITE_BASE_URL?.replace(/\/$/, "");
const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--remote-allow-origins=*", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1600,1000", "about:blank"], {stdio: "ignore"});
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let target;
for (let attempt = 0; attempt < 70 && !target; attempt += 1) {
  try { target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())).find(candidate => candidate.type === "page"); } catch {}
  if (!target) await delay(100);
}
if (!target) { child.kill(); throw new Error("Chrome did not start"); }

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true}); });
let sequence = 0;
const pending = new Map();
const browserErrors = [];
const requestUrls = new Map();
const failedResources = [];
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const request = pending.get(message.id); pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") browserErrors.push(message.params.entry.text);
  if (message.method === "Network.requestWillBeSent") requestUrls.set(message.params.requestId, message.params.request.url);
  if (message.method === "Network.loadingFailed") failedResources.push({url: requestUrls.get(message.params.requestId), error: message.params.errorText});
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, {resolve, reject}); socket.send(JSON.stringify({id, method, params})); });
const evaluate = async expression => {
  const result = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
async function waitFor(expression) { for (let attempt = 0; attempt < 70; attempt += 1) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); }
async function navigate(file, ready = "document.readyState==='complete'") {
  const url = siteBaseUrl ? `${siteBaseUrl}/${file}` : `file:///${client}/${file}`;
  const expectedUrl = siteBaseUrl
    ? `${siteBaseUrl}/${file === "index.html" ? "" : file.replace(/\.html$/, "")}`
    : url;
  await send("Page.navigate", {url});
  await waitFor(`location.href===${JSON.stringify(expectedUrl)}&&(${ready})`);
  await delay(100);
}
async function clickAt(point) { await send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1}); await send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1}); await delay(45); }

const results = {};
try {
  const server = (await import(`${pathToFileURL(path.resolve("dist/server/index.js")).href}?validation=${Date.now()}`)).default;
  const assets = {fetch: request => {
    const pathname = new URL(request.url).pathname;
    return new Response(pathname, {status: ["/market.html", "/about.html", "/branded-not-found.html"].includes(pathname) ? 200 : 404});
  }};
  const routeBodies = [];
  for (const route of ["/market", "/market/", "/market.html"]) routeBodies.push(await (await server.fetch(new Request(`https://example.test${route}`), {ASSETS: assets})).text());
  results.marketRoutes = routeBodies.every(body => body === "/market.html");
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable"); await send("Network.enable");
  for (const page of ["index.html", "about.html", "rules.html", "leaderboards.html", "staff.html", "gallery.html", "vote.html"]) {
    await navigate(page);
    results[`page:${page}`] = await evaluate("Boolean(document.querySelector('.site-header')&&document.querySelector('main')&&document.querySelector('a[href=\"market.html\"]'))");
  }

  browserErrors.length = 0;
  failedResources.length = 0;
  await navigate("market.html", "window.__MARKET_TEST__?.counts.buildings===15");
  results.counts = await evaluate("window.__MARKET_TEST__.counts");
  results.nativeStyle = await evaluate("getComputedStyle(document.querySelector('.map-card')).borderStyle==='solid'&&getComputedStyle(document.querySelector('.market-intro h1')).fontSize!=='16px'");
  results.activeNavigation = await evaluate("document.querySelector('.nav a.active')?.getAttribute('href')==='market.html'");
  results.disclaimer = await evaluate("document.body.innerText.includes('NOT AN OFFICIAL MINECRAFT PRODUCT')");
  results.singleHoverTooltip = await evaluate("(()=>{const T=window.__MARKET_TEST__,b=T.layout.buildings.find(x=>x.id==='building-7'),p=b.labelPoint,t=T.layout.renderTransform,v=T.state.view,r=document.querySelector('#market-map').getBoundingClientRect(),event=new PointerEvent('pointermove',{clientX:r.left+v.x+(p.x-t.originX)*t.pixelsPerBlock*v.scale,clientY:r.top+v.y+(p.z-t.originZ)*t.pixelsPerBlock*v.scale,pointerId:80});document.querySelector('#market-map').dispatchEvent(event);const visible=[...document.querySelectorAll('.map-tooltip:not([hidden]),.map-label.visible')].filter(node=>node.textContent.trim()===b.label);return visible.length===1})()");

  const buildingIds = await evaluate("window.__MARKET_TEST__.layout.buildings.map(building=>building.id)");
  results.allBuildingsClickable = true;
  results.failedBuildingIds = [];
  for (const id of buildingIds) {
    await evaluate("window.__MARKET_TEST__.closeDrawer();document.querySelector('#market-map').scrollIntoView({block:'center'});document.querySelector('#fit-map').click()");
    await delay(35);
    const point = await evaluate(`(()=>{const T=window.__MARKET_TEST__,b=T.layout.buildings.find(x=>x.id==='${id}'),p=b.labelPoint,t=T.layout.renderTransform,v=T.state.view,r=document.querySelector('#market-map').getBoundingClientRect();return{x:r.left+v.x+(p.x-t.originX)*t.pixelsPerBlock*v.scale,y:r.top+v.y+(p.z-t.originZ)*t.pixelsPerBlock*v.scale}})()`);
    await clickAt(point);
    if (!await evaluate(`window.__MARKET_TEST__.state.selectedBuilding==='${id}'`)) { results.allBuildingsClickable = false; results.failedBuildingIds.push(id); }
  }

  results.shopInspector = await evaluate("(()=>{const T=window.__MARKET_TEST__,shop=T.adapter.getShops()[0];T.openStall(shop.stall,null,shop.id);document.querySelector('.shop-card.highlight').click();return !document.querySelector('#item-inspector').hidden&&!document.querySelector('#market-drawer').hidden})()");
  await waitFor("[...document.images].every(image=>image.complete)");
  results.failedImages = await evaluate("[...document.images].filter(image=>image.complete&&image.naturalWidth===0).map(image=>image.src)");
  results.realIcons = await evaluate("[...document.querySelectorAll('.minecraft-item-icon img')].every(image=>image.complete&&image.naturalWidth>0)&&!document.querySelector('.item-icon,.shop-item-icon')");
  results.shulker = await evaluate("(()=>{const T=window.__MARKET_TEST__,shop=T.adapter.getShops().find(x=>x.sellItem.metadata?.container?.type==='SHULKER');T.openStall(shop.stall,null,shop.id);T.openInspector(shop.id,'sellItem');return document.querySelectorAll('.minecraft-slot').length===27})()");
  results.nestedSearch = await evaluate("(()=>{const T=window.__MARKET_TEST__,match=T.executeSearch('ender pearl').find(x=>x.match.contained);document.querySelector('[data-result-index]').click();return Boolean(match&&T.state.selectedStall===match.stall.id&&!document.querySelector('#item-inspector').hidden&&document.querySelector('.focused-match'))})()");
  results.noHorizontalOverflow = await evaluate("document.querySelector('#item-inspector').scrollWidth<=document.querySelector('#item-inspector').clientWidth+1&&document.querySelector('#market-drawer').scrollWidth<=document.querySelector('#market-drawer').clientWidth+1");
  results.catalogSuggestions = await evaluate("(()=>{const T=window.__MARKET_TEST__,values=T.adapter.suggest('d');return values.length>=10&&values.some(value=>value.displayName==='Diamond')&&values.every(value=>[value.displayName,value.subtitle,value.searchQuery,value.material].filter(Boolean).some(term=>term.toLowerCase().startsWith('d')))})()");
  results.searchLocation = await evaluate("(()=>{const T=window.__MARKET_TEST__;T.executeSearch('diamond');const text=document.querySelector('.result-card')?.innerText||'';return /Stall \\d+ · Floor \\d+/.test(text)&&!/Building \\d+/.test(text)&&!text.includes('Stalls ')})()");
  results.containerResult = await evaluate("(()=>{const T=window.__MARKET_TEST__;T.executeSearch('ender pearl');const card=document.querySelector('.result-card'),text=card?.innerText||'';return text.includes('Inside Purple Shulker Box › Bundle')&&!text.includes('sold separately')&&card.querySelector('.minecraft-item-icon')?.getAttribute('aria-label')==='Purple Shulker Box'})()");
  results.bundle = await evaluate("(()=>{const T=window.__MARKET_TEST__,shop=T.adapter.getShops().find(x=>x.sellItem.metadata?.container?.type==='BUNDLE');T.openStall(shop.stall,null,shop.id);T.openInspector(shop.id,'sellItem');return Boolean(document.querySelector('.minecraft-bundle-tooltip'))&&document.querySelectorAll('.bundle-slot').length===3&&document.body.innerText.includes('Full!')&&!document.body.innerText.includes(\"Explorer's Bundle\")})()");
  results.shulkerCrop = await evaluate("(()=>{const T=window.__MARKET_TEST__,shop=T.adapter.getShops().find(x=>x.sellItem.metadata?.container?.type==='SHULKER');T.openStall(shop.stall,null,shop.id);T.openInspector(shop.id,'sellItem');const node=document.querySelector('.minecraft-shulker-window'),ratio=node.getBoundingClientRect().width/node.getBoundingClientRect().height;return document.querySelectorAll('.minecraft-slot').length===27&&ratio>2.30&&ratio<2.33&&!document.querySelector('.player-inventory,.hotbar')})()");
  results.avatarContract = await evaluate("(()=>{const T=window.__MARKET_TEST__,stall=T.snapshot.stalls.find(x=>x.owner.type==='PLAYER'&&x.owner.avatarUrl);T.openStall(stall);const image=document.querySelector('.resolved-head');return Boolean(image&&image.dataset.outerLayer==='true'&&image.naturalWidth>0)})()");

  results.mobileViewports = {};
  for (const [width, height] of [[320,568],[360,640],[375,667],[390,844],[430,932],[844,390]]) {
    await send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 1, mobile: true});
    await navigate("market.html", "window.__MARKET_TEST__?.counts.stalls===71");
    results.mobileViewports[`${width}x${height}`] = await evaluate("(()=>{const T=window.__MARKET_TEST__,shop=T.adapter.getShops().find(x=>x.sellItem.metadata?.container?.type==='SHULKER');T.openStall(shop.stall,null,shop.id);T.openInspector(shop.id,'sellItem');const drawer=getComputedStyle(document.querySelector('#market-drawer')),inspector=getComputedStyle(document.querySelector('#item-inspector')),visible=[drawer,inspector].filter(style=>style.display!=='none'&&style.visibility!=='hidden').length;return visible===1&&document.querySelectorAll('.minecraft-slot').length===27&&document.documentElement.scrollWidth<=document.documentElement.clientWidth+1})()");
  }
  results.mobile = Object.values(results.mobileViewports).every(Boolean);
  await send("Emulation.setDeviceMetricsOverride", {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
  await navigate("market.html", "window.__MARKET_TEST__?.counts.stalls===71");
  results.increasedTextMetrics = await evaluate("(()=>{document.documentElement.style.fontSize='200%';const root=document.querySelector('.market-page-root'),heading=document.querySelector('.map-heading'),map=document.querySelector('#market-map'),search=document.querySelector('.item-search'),viewport=document.documentElement.clientWidth;return{pageWidth:root.scrollWidth,viewportWidth:Math.min(viewport,root.clientWidth),mapTop:map.getBoundingClientRect().top,headingBottom:heading.getBoundingClientRect().bottom,searchWidth:search.scrollWidth,searchClientWidth:search.clientWidth}})()");
  results.increasedTextSize = results.increasedTextMetrics.pageWidth <= results.increasedTextMetrics.viewportWidth + 1
    && results.increasedTextMetrics.mapTop >= results.increasedTextMetrics.headingBottom - 1
    && results.increasedTextMetrics.searchWidth <= results.increasedTextMetrics.searchClientWidth + 1;
  results.browserErrors = browserErrors;
  results.failedResources = failedResources.filter(resource => resource.error !== "net::ERR_ABORTED");
  console.log(JSON.stringify(results, null, 2));
  if (Object.entries(results).some(([key, value]) => !["counts", "browserErrors", "failedResources", "failedImages", "failedBuildingIds", "mobileViewports", "increasedTextMetrics"].includes(key) && value !== true) || Object.values(results.mobileViewports || {}).some(value => value !== true) || browserErrors.length || failedResources.length || results.failedImages.length || results.failedBuildingIds.length) process.exitCode = 1;
} finally {
  socket.close(); child.kill();
}
