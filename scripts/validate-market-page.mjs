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
  results.liveUpdatePreservesContext = await evaluate(`(()=>{
    const T=window.__MARKET_TEST__,stall=T.adapter.getShops().find(shop=>shop.stall.owner.type==='PLAYER').stall;
    const untouched=T.adapter.snapshot.stalls.find(candidate=>candidate.id!==stall.id),shop=stall.shops[0];
    document.querySelector('#item-search').value='diamond';T.executeSearch('diamond');
    document.querySelector('#owner-filter').value='PLAYER';document.querySelector('#owner-filter').dispatchEvent(new Event('change'));
    T.openStall(stall,null,shop.id);T.openInspector(shop.id,'sellItem');
    const view={...T.state.view},modified={...stall,owner:{...stall.owner,name:'Live Preview Test'},shops:stall.shops.map((candidate,index)=>index?candidate:{...candidate,owner:{...candidate.owner,name:'LiveShopOwner'},stockCount:candidate.stockCount+1})};
    T.marketClient.handleMessage(JSON.stringify({type:'stall.updated',schemaVersion:1,sequence:T.marketClient.sequence+1,stallId:stall.id,revision:2,updatedAt:new Date().toISOString(),stall:modified}));
    const drawer=document.querySelector('#market-drawer').innerText,inspector=document.querySelector('#item-inspector').innerText;
    return T.adapter.snapshot.stalls.find(candidate=>candidate.id===untouched.id)===untouched
      &&document.querySelector('#item-search').value==='diamond'&&T.state.lastSearch.query==='diamond'
      &&document.querySelector('#owner-filter').value==='PLAYER'&&T.state.filters.owner==='PLAYER'
      &&T.state.selectedStall===stall.id&&drawer.includes('Live Preview Test')&&inspector.includes('LiveShopOwner')
      &&T.state.view.scale===view.scale&&T.state.view.x===view.x&&T.state.view.y===view.y;
  })()`);
  results.liveConnectionBadge = await evaluate("(()=>{const T=window.__MARKET_TEST__;T.marketClient.source='api';T.marketClient.emitStatus('live');return document.querySelector('#market-connection-label').textContent==='Live'&&document.querySelector('#market-connection-status').dataset.source==='api'})()");
  results.nullOwnerAndRentRendering = await evaluate("(()=>{const T=window.__MARKET_TEST__,stall=T.adapter.snapshot.stalls.find(value=>value.owner.type==='NONE'&&value.ownerSince===null&&value.nextRentAt===null);T.openStall(stall);const text=document.querySelector('#market-drawer').innerText;return !/null|invalid date/i.test(text)})()");
  results.nativeStyle = await evaluate("getComputedStyle(document.querySelector('.map-card')).borderStyle==='solid'&&getComputedStyle(document.querySelector('.market-intro h1')).fontSize!=='16px'");
  results.activeNavigation = await evaluate("document.querySelector('.nav a.active')?.getAttribute('href')==='market.html'");
  results.disclaimer = await evaluate("document.body.innerText.includes('NOT AN OFFICIAL MINECRAFT PRODUCT')");
  results.singleHoverTooltip = await evaluate("(()=>{const T=window.__MARKET_TEST__,b=T.layout.buildings.find(x=>x.id==='building-7'),p=b.labelPoint,t=T.layout.renderTransform,v=T.state.view,r=document.querySelector('#market-map').getBoundingClientRect(),event=new PointerEvent('pointermove',{clientX:r.left+v.x+(p.x-t.originX)*t.pixelsPerBlock*v.scale,clientY:r.top+v.y+(p.z-t.originZ)*t.pixelsPerBlock*v.scale,pointerId:80});document.querySelector('#market-map').dispatchEvent(event);const visible=[...document.querySelectorAll('.map-tooltip:not([hidden]),.map-label.visible')].filter(node=>node.textContent.trim()===b.label);return visible.length===1})()");

  const buildingIds = await evaluate("window.__MARKET_TEST__.layout.buildings.map(building=>building.id)");
  results.allBuildingsClickable = true;
  results.failedBuildingIds = [];
  for (const id of buildingIds) {
    await evaluate("window.__MARKET_TEST__.closeDrawer();document.querySelector('#market-map').scrollIntoView({block:'center'});document.querySelector('#fit-map').click()");
    await delay(75);
    let selected = false;
    for (let attempt = 0; attempt < 3 && !selected; attempt += 1) {
      const point = await evaluate(`(()=>{const T=window.__MARKET_TEST__,b=T.layout.buildings.find(x=>x.id==='${id}'),p=b.labelPoint,t=T.layout.renderTransform,v=T.state.view,r=document.querySelector('#market-map').getBoundingClientRect();return{x:r.left+v.x+(p.x-t.originX)*t.pixelsPerBlock*v.scale,y:r.top+v.y+(p.z-t.originZ)*t.pixelsPerBlock*v.scale}})()`);
      await clickAt(point); await delay(40);
      selected = await evaluate(`window.__MARKET_TEST__.state.selectedBuilding==='${id}'`);
    }
    if (!selected) { results.allBuildingsClickable = false; results.failedBuildingIds.push(id); }
  }

  results.shopInspector = await evaluate("(()=>{const T=window.__MARKET_TEST__,shop=T.adapter.getShops()[0];T.openStall(shop.stall,null,shop.id);document.querySelector('.shop-card.highlight').click();return !document.querySelector('#item-inspector').hidden&&!document.querySelector('#market-drawer').hidden})()");
  await waitFor("[...document.images].every(image=>image.complete)");
  results.failedImages = await evaluate("[...document.images].filter(image=>image.complete&&image.naturalWidth===0).map(image=>image.src)");
  results.realIcons = await evaluate("(async()=>{for(let attempts=0;attempts<50&&[...document.querySelectorAll('.minecraft-item-icon')].some(icon=>icon.dataset.rasterRendered!=='true');attempts++)await new Promise(resolve=>setTimeout(resolve,40));const icons=[...document.querySelectorAll('.minecraft-item-icon')];return icons.length>0&&icons.every(icon=>icon.querySelector('.item-raster')&&icon.dataset.rasterRendered==='true')&&!document.querySelector('.item-icon,.shop-item-icon')})()");
  results.shulker = await evaluate("(()=>{const T=window.__MARKET_TEST__,shop=T.adapter.getShops().find(x=>x.sellItem.metadata?.container?.type==='SHULKER');T.openStall(shop.stall,null,shop.id);T.openInspector(shop.id,'sellItem');return document.querySelectorAll('.minecraft-slot').length===27})()");
  results.nestedSearch = await evaluate("(()=>{const T=window.__MARKET_TEST__,match=T.executeSearch('ender pearl').find(x=>x.match.contained);document.querySelector('[data-result-index]').click();return Boolean(match&&T.state.selectedStall===match.stall.id&&!document.querySelector('#item-inspector').hidden&&document.querySelector('.focused-match'))})()");
  results.noHorizontalOverflow = await evaluate("document.querySelector('#item-inspector').scrollWidth<=document.querySelector('#item-inspector').clientWidth+1&&document.querySelector('#market-drawer').scrollWidth<=document.querySelector('#market-drawer').clientWidth+1");
  results.catalogSuggestions = await evaluate("(()=>{const T=window.__MARKET_TEST__,values=T.adapter.suggest('d');return values.length>=10&&values.some(value=>value.displayName==='Diamond')&&values.every(value=>[value.displayName,value.subtitle,value.searchQuery,value.material].filter(Boolean).some(term=>term.toLowerCase().startsWith('d')))})()");
  results.searchLocation = await evaluate("(()=>{const T=window.__MARKET_TEST__;T.executeSearch('diamond');const text=document.querySelector('.result-card')?.innerText||'';return /Stall \\d+ · Building \\d+ · Floor \\d+/.test(text)&&!text.includes('Stalls ')})()");
  results.containerResult = await evaluate("(()=>{const T=window.__MARKET_TEST__,result=T.executeSearch('ender pearl').find(value=>value.match.contained),card=document.querySelector('.result-card'),text=card?.innerText||'',outer=result?.match.containerPath?.[0]||result?.match.container;return Boolean(result&&outer)&&text.includes('Inside ')&&!text.includes('sold separately')&&card.querySelector('.minecraft-item-icon')?.getAttribute('aria-label')===outer.displayName})()");
  results.structuredAliases = await evaluate("(()=>{const T=window.__MARKET_TEST__,A=window.EnthusiaMarketAdapter;return A.querySpec('gap').normalized==='golden apple'&&A.querySpec('notch apple').normalized==='enchanted golden apple'&&A.querySpec('sword').category.id==='SWORD'&&T.adapter.searchItems('shulker').every(value=>value.match.item.material.endsWith('SHULKER_BOX'))&&T.adapter.searchItems('red shulker')[0]?.match.item.material==='RED_SHULKER_BOX'})()");
  results.officialGlint = await evaluate("(()=>{const T=window.__MARKET_TEST__,shop=T.adapter.getShops().find(value=>value.sellItem.metadata?.enchantments||value.sellItem.metadata?.storedEnchantments);T.openStall(shop.stall,null,shop.id);return Boolean(document.querySelector('.minecraft-item-icon.enchanted .item-glint'))})()");
  results.bundle = await evaluate("(()=>{const T=window.__MARKET_TEST__,shop=T.adapter.getShops().find(x=>x.sellItem.metadata?.container?.type==='BUNDLE');T.openStall(shop.stall,null,shop.id);T.openInspector(shop.id,'sellItem');return Boolean(document.querySelector('.minecraft-bundle-tooltip'))&&document.querySelectorAll('.bundle-slot').length===3&&document.body.innerText.includes('Full!')&&!document.body.innerText.includes(\"Explorer's Bundle\")})()");
  results.shulkerCrop = await evaluate("(()=>{const T=window.__MARKET_TEST__,shop=T.adapter.getShops().find(x=>x.sellItem.metadata?.container?.type==='SHULKER');T.openStall(shop.stall,null,shop.id);T.openInspector(shop.id,'sellItem');const node=document.querySelector('.minecraft-shulker-window'),ratio=node.getBoundingClientRect().width/node.getBoundingClientRect().height;return document.querySelectorAll('.minecraft-slot').length===27&&ratio>2.30&&ratio<2.33&&!document.querySelector('.player-inventory,.hotbar')})()");
  results.overlayPortal = await evaluate("(()=>{const portal=document.querySelector('body>.market-overlay-portal');return Boolean(portal&&portal.contains(document.querySelector('#market-drawer'))&&portal.contains(document.querySelector('#item-inspector'))&&portal.contains(document.querySelector('#minecraft-hover-tooltip'))&&getComputedStyle(portal).position==='static')})()");
  results.rootScrollbarHidden = await evaluate("getComputedStyle(document.documentElement).scrollbarWidth==='none'&&document.documentElement.scrollHeight>document.documentElement.clientHeight");
  results.suggestionScrollbar = await evaluate("(()=>{const input=document.querySelector('#item-search');input.value='potion';input.dispatchEvent(new Event('input'));const box=document.querySelector('#search-suggestions'),style=getComputedStyle(box);return !box.hidden&&box.scrollHeight>box.clientHeight&&style.scrollbarColor.includes('rgb(166, 83, 38)')})()");
  results.potionFamiliesReachable = await evaluate("(()=>{const values=window.__MARKET_TEST__.adapter.suggest('potion',220);return values.length>=184&&values.some(value=>value.displayName.includes('Strength'))&&values.some(value=>value.displayName.includes('Slow Falling'))})()");
  results.filterRemovalControls = await evaluate("(()=>{const floor=document.querySelector('#floor-filter'),owner=document.querySelector('#owner-filter');floor.value='2';floor.dispatchEvent(new Event('change'));owner.value='PLAYER';owner.dispatchEvent(new Event('change'));const one=document.querySelector('[data-remove-filter=\"floor\"]');if(!one||!document.querySelector('#clear-active-filters'))return false;one.click();const removed=floor.value==='ALL'&&owner.value==='PLAYER';document.querySelector('#clear-active-filters').click();return removed&&owner.value==='ALL'&&!document.querySelector('[data-remove-filter]')})()");
  results.panelGeometry = await evaluate("(async()=>{const T=window.__MARKET_TEST__,building=T.layout.buildings.find(value=>value.stallIds.length>1),header=document.querySelector('.site-header');T.openBuilding(building);for(const y of[0,document.querySelector('.filter-shell').offsetTop,document.querySelector('.map-card').offsetTop,document.documentElement.scrollHeight-innerHeight]){scrollTo(0,y);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const panel=document.querySelector('#market-drawer').getBoundingClientRect(),visible=Math.max(0,Math.min(innerHeight,header.getBoundingClientRect().bottom));if(Math.abs(panel.top-visible)>2||Math.abs(panel.bottom-innerHeight)>2)return false}header.style.transform='translateY(-100%)';await new Promise(resolve=>setTimeout(resolve,80));const hidden=document.querySelector('#market-drawer').getBoundingClientRect();header.style.transform='';return hidden.top<=2&&Math.abs(hidden.bottom-innerHeight)<=2})()");
  results.inspectorQuantityOmitted = await evaluate("(()=>{const T=window.__MARKET_TEST__,shop=T.adapter.getShops().find(value=>value.sellAmount>1);T.openStall(shop.stall,null,shop.id);T.openInspector(shop.id,'sellItem');const detail=document.querySelector('.minecraft-tooltip .inspected-item h3').textContent,tabs=document.querySelector('.inspector-transaction-tabs').textContent;return !detail.includes('×')&&!detail.includes('Â·')&&tabs.includes(shop.sellAmount+'×')&&tabs.includes(shop.costAmount+'×')})()");
  results.avatarContract = await evaluate("(()=>{const T=window.__MARKET_TEST__,url='https://market-api.enthusia.info/v1/player-heads/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.png',markup=T.ownerVisual({type:'PLAYER',name:'Captured',avatarUrl:url,avatar:{kind:'MINECRAFT_HEAD',source:'BEDROCK_CAPTURED',includesOuterLayer:true}});return markup.includes(url)&&markup.includes('data-outer-layer=\"true\"')})()");
  results.ownerVisualLocations = await evaluate("(()=>{const T=window.__MARKET_TEST__,approved={type:'PLAYER',name:'Approved',avatarUrl:'https://minotar.net/helm/Approved/96.png',avatar:{kind:'MINECRAFT_HEAD',source:'JAVA',includesOuterLayer:true}},missing={type:'PLAYER',name:'No visual',avatarUrl:null,avatar:{kind:'MINECRAFT_HEAD',source:'PROXY',includesOuterLayer:true}};return T.ownerVisual(approved).includes('data-owner-head-url')&&!T.ownerVisual(missing)&&!T.ownerVisual({...approved,avatarUrl:'player-head-java.svg'})})()");
  results.bannerRendering = await evaluate("(async()=>{const T=window.__MARKET_TEST__,host=document.createElement('div'),owner={type:'GUILD',name:'Synthetic Guild',avatar:{kind:'GUILD_BANNER',banner:{baseColor:'BLUE',patterns:[{type:'STRIPE_TOP',color:'WHITE'},{type:'CROSS',color:'RED'},{type:'BORDER',color:'BLACK'},{type:'TRIANGLE_TOP',color:'YELLOW'},{type:'CIRCLE',color:'LIME'},{type:'FLOWER',color:'PURPLE'}]}}};host.innerHTML=T.ownerVisual(owner);document.body.append(host);T.hydrateOwnerVisuals(host);const canvas=host.querySelector('canvas');for(let i=0;i<50&&canvas?.dataset.bannerRendered!=='true';i++)await new Promise(resolve=>setTimeout(resolve,20));const ok=canvas?.dataset.bannerRendered==='true'&&canvas.getContext('2d').getImageData(0,0,40,80).data.some(value=>value!==0);host.remove();return ok})()");
  results.allBannerPatterns = await evaluate("(async()=>{const T=window.__MARKET_TEST__,types=['SQUARE_BOTTOM_LEFT','SQUARE_BOTTOM_RIGHT','SQUARE_TOP_LEFT','SQUARE_TOP_RIGHT','STRIPE_BOTTOM','STRIPE_TOP','STRIPE_LEFT','STRIPE_RIGHT','STRIPE_CENTER','STRIPE_MIDDLE','STRIPE_DOWNRIGHT','STRIPE_DOWNLEFT','STRIPE_SMALL','CROSS','STRAIGHT_CROSS','TRIANGLE_BOTTOM','TRIANGLE_TOP','TRIANGLES_BOTTOM','TRIANGLES_TOP','DIAGONAL_LEFT','DIAGONAL_RIGHT','DIAGONAL_LEFT_MIRROR','DIAGONAL_RIGHT_MIRROR','CIRCLE','RHOMBUS','HALF_VERTICAL','HALF_HORIZONTAL','HALF_VERTICAL_MIRROR','HALF_HORIZONTAL_MIRROR','BORDER','CURLY_BORDER','GRADIENT','GRADIENT_UP','BRICKS','GLOBE','CREEPER','SKULL','FLOWER','MOJANG','PIGLIN','FLOW','GUSTER'];const canvases=types.map(()=>Object.assign(document.createElement('canvas'),{width:40,height:80}));await Promise.all(types.map((type,index)=>T.drawGuildBanner(canvases[index],{baseColor:'WHITE',patterns:[{type,color:'RED'}]})));return canvases.every(canvas=>canvas.getContext('2d').getImageData(0,0,40,80).data.some(value=>value!==0))})()");
  results.imageFailureFallback = await evaluate("(async()=>{const T=window.__MARKET_TEST__,Original=window.Image,host=document.createElement('div');class FailedImage{constructor(){this.dataset={}}set src(value){queueMicrotask(()=>this.onerror?.())}}window.Image=FailedImage;host.innerHTML=T.ownerVisual({type:'PLAYER',name:'SyntheticFailure',avatarUrl:'https://minotar.net/helm/SyntheticFailure/96.png',avatar:{kind:'MINECRAFT_HEAD',source:'JAVA',includesOuterLayer:true}});document.body.append(host);T.hydrateOwnerVisuals(host);await Promise.resolve();window.Image=Original;const ok=!host.querySelector('.owner-image')&&!host.querySelector('.resolved-head');host.remove();return ok})()");
  results.websocketPreservesGuildVisual = await evaluate("(()=>{const T=window.__MARKET_TEST__,stall=T.adapter.snapshot.stalls[0],visual={kind:'GUILD_BANNER',source:'LUMAGUILDS',banner:{baseColor:'RED',patterns:[]}},updated={...stall,owner:{...stall.owner,type:'GUILD',avatar:visual}};T.adapter.replaceStall(updated);const replacement={...updated,shops:[...updated.shops]};T.adapter.replaceStall(replacement);return T.adapter.getStall(stall.id).owner.avatar.banner.baseColor==='RED'})()");

  results.mobileViewports = {};
  for (const [width, height] of [[320,568],[360,640],[375,667],[390,844],[430,932],[844,390]]) {
    await send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 1, mobile: true});
    await navigate("market.html", "window.__MARKET_TEST__?.counts.stalls===71");
    results.mobileViewports[`${width}x${height}`] = await evaluate("(()=>{const T=window.__MARKET_TEST__,shop=T.adapter.getShops().find(x=>x.sellItem.metadata?.container?.type==='SHULKER');T.openStall(shop.stall,null,shop.id);const owner=Boolean(document.querySelector('.stall-hero .owner-image'));T.openInspector(shop.id,'sellItem');const drawer=getComputedStyle(document.querySelector('#market-drawer')),inspector=getComputedStyle(document.querySelector('#item-inspector')),visible=[drawer,inspector].filter(style=>style.display!=='none'&&style.visibility!=='hidden').length;return owner&&visible===1&&document.querySelectorAll('.minecraft-slot').length===27&&document.documentElement.scrollWidth<=document.documentElement.clientWidth+1})()");
  }
  results.mobile = Object.values(results.mobileViewports).every(Boolean);
  await send("Emulation.setDeviceMetricsOverride", {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate("market.html", "window.__MARKET_TEST__?.counts.buildings===15");
  results.mobileResultsContext = await evaluate("(()=>{const T=window.__MARKET_TEST__,building=T.layout.buildings.find(value=>value.stallIds.length>1);T.openBuilding(building);T.executeSearch('shulker');const context=document.querySelector('#market-drawer'),results=document.querySelector('#search-results'),content=document.querySelector('.search-results-content');content.scrollTop=content.scrollHeight;const last=document.querySelector('.result-card:last-child')?.getBoundingClientRect(),contextRect=context.getBoundingClientRect();return context.classList.contains('mobile-context-tab')&&results.classList.contains('mobile-sheet-active')&&results.getBoundingClientRect().bottom<=contextRect.top+1&&last.bottom<=contextRect.top-4})()");
  results.mobileFooterFlow = await evaluate("(()=>{const footer=document.querySelector('.site-footer'),sheet=document.querySelector('#search-results');return getComputedStyle(footer).position!=='fixed'&&Number(getComputedStyle(footer).zIndex||0)<Number(getComputedStyle(sheet).zIndex||0)&&document.documentElement.scrollWidth<=document.documentElement.clientWidth})()");
  await send("Emulation.setDeviceMetricsOverride", {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
  await navigate("market.html", "window.__MARKET_TEST__?.counts.stalls===71");
  results.increasedTextMetrics = await evaluate("(()=>{document.documentElement.style.fontSize='200%';const root=document.querySelector('.market-page-root'),heading=document.querySelector('.map-heading'),map=document.querySelector('#market-map'),search=document.querySelector('.item-search'),viewport=document.documentElement.clientWidth;return{pageWidth:root.scrollWidth,viewportWidth:Math.min(viewport,root.clientWidth),mapTop:map.getBoundingClientRect().top,headingBottom:heading.getBoundingClientRect().bottom,searchWidth:search.scrollWidth,searchClientWidth:search.clientWidth}})()");
  results.increasedTextSize = results.increasedTextMetrics.pageWidth <= results.increasedTextMetrics.viewportWidth + 1
    && results.increasedTextMetrics.mapTop >= results.increasedTextMetrics.headingBottom - 1
    && results.increasedTextMetrics.searchWidth <= results.increasedTextMetrics.searchClientWidth + 1;
  results.browserErrors = browserErrors;
  results.failedResources = failedResources.filter(resource => resource.error !== "net::ERR_ABORTED");
  console.log(JSON.stringify(results, null, 2));
  if (Object.entries(results).some(([key, value]) => !["counts", "browserErrors", "failedResources", "failedImages", "failedBuildingIds", "mobileViewports", "increasedTextMetrics"].includes(key) && value !== true) || Object.values(results.mobileViewports || {}).some(value => value !== true) || browserErrors.length || results.failedResources.length || results.failedImages.length || results.failedBuildingIds.length) process.exitCode = 1;
} finally {
  socket.close(); child.kill();
}
