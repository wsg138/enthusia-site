import { spawn } from "node:child_process";
import path from "node:path";

const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const siteBaseUrl = process.env.SITE_BASE_URL?.replace(/\/$/, "");
const marketUrl = siteBaseUrl ? `${siteBaseUrl}/market` : `file:///${path.resolve("dist/client/market.html").replaceAll("\\", "/")}`;
const port = Number(process.env.CHROME_DEBUG_PORT || 9778);
const profile = path.resolve(`dist/chrome-market-polish-${siteBaseUrl ? "https" : "local"}`);
const chromeProcess = spawn(chrome, ["--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--remote-allow-origins=*", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1600,1000", "about:blank"], { stdio: "ignore" });
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let target;
for (let attempt = 0; attempt < 70 && !target; attempt += 1) {
  try { target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())).find(candidate => candidate.type === "page"); } catch {}
  if (!target) await delay(100);
}
if (!target) { chromeProcess.kill(); throw new Error("Chrome did not start"); }

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sequence = 0;
const pending = new Map();
const browserErrors = [];
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { const request = pending.get(message.id); pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
  if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") browserErrors.push(message.params.entry.text);
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
async function ready() { for (let attempt = 0; attempt < 80; attempt += 1) { if (await evaluate("window.__MARKET_TEST__?.counts.stalls===71")) return; await delay(100); } throw new Error("Market did not become ready"); }
async function navigate() { await send("Page.navigate", { url: marketUrl }); await ready(); await delay(120); }

async function validateViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await navigate();
  return evaluate(`(async()=>{const T=window.__MARKET_TEST__,shop=T.adapter.getShops().find(value=>value.sellItem.material==='LIGHT_BLUE_SHULKER_BOX');T.openInspector(shop.id,'sellItem');for(let attempt=0;attempt<60&&document.querySelector('.shulker-visual')?.dataset.rendered!=='true';attempt++)await new Promise(resolve=>setTimeout(resolve,40));const frame=document.querySelector('.shulker-frame'),wrapper=document.querySelector('.minecraft-shulker-window'),canvas=document.querySelector('.shulker-visual'),style=getComputedStyle(frame),available=frame.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),displayed=wrapper.getBoundingClientRect().width,slot=document.querySelector('.shulker-slot-grid .minecraft-slot').getBoundingClientRect(),item=document.querySelector('.shulker-item-cell .minecraft-item-icon').getBoundingClientRect(),separateLayers=Boolean(document.querySelector('.shulker-item-grid')&&document.querySelector('.shulker-slot-grid'));const orange=T.adapter.searchItems('orange shulker box'),orangeSuggestions=T.adapter.suggest('orange shulker box',30),generic=T.adapter.searchItems('shulker'),trimSuggestions=T.adapter.suggest('armor trim',60),rent=document.querySelector('#rent-filter');T.closeInspector();rent.value='UNDER_1_DAY';rent.dispatchEvent(new Event('change'));const rentChip=document.querySelector('[data-remove-filter=rent]')?.parentElement.textContent.trim()||'';const trimShop=T.adapter.getShops().find(value=>value.sellItem.material==='COAST_ARMOR_TRIM_SMITHING_TEMPLATE'||value.costItem.material==='COAST_ARMOR_TRIM_SMITHING_TEMPLATE'),side=trimShop.sellItem.material==='COAST_ARMOR_TRIM_SMITHING_TEMPLATE'?'sellItem':'costItem';T.openInspector(trimShop.id,side);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const heading=document.querySelector('.fit-inspector-heading .minecraft-bitmap-text'),identifier=document.querySelector('.minecraft-bitmap-text.identifier');return{counts:T.counts,displayed,available,noOverflow:displayed<=available+1,backingScale:Number(canvas.dataset.backingScale),slotWidth:slot.width,itemWidth:item.width,separateLayers,genericCount:generic.length,orangeCount:orange.length,orangeSuggestion:orangeSuggestions[0]?.material,trimTemplateCount:new Set(trimSuggestions.filter(value=>value.material?.endsWith('_ARMOR_TRIM_SMITHING_TEMPLATE')).map(value=>value.material)).size,pseudoTrimCount:trimSuggestions.filter(value=>value.kind==='ARMOR_TRIM_MATERIAL').length,rentOptions:[...rent.options].map(option=>option.value),rentChip,trimHeading:heading?.getAttribute('aria-label'),identifierFits:identifier.getBoundingClientRect().right<=identifier.parentElement.getBoundingClientRect().right+1,horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1}})()`);
}

try {
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
  const desktop = await validateViewport(1600, 1000, false);
  const mobile = await validateViewport(390, 844, true);
  const checks = [desktop, mobile].every(result => result.counts.buildings === 15 && result.counts.stalls === 71 && result.displayed <= Math.min(353, result.available + 1) && result.noOverflow && result.backingScale === 1 && Math.abs(result.slotWidth - result.displayed * 18 / 176) < .25 && Math.abs(result.itemWidth - result.displayed * 16 / 176) < .25 && result.separateLayers && result.genericCount > 1 && result.orangeCount === 0 && result.orangeSuggestion === "ORANGE_SHULKER_BOX" && result.trimTemplateCount === 18 && result.pseudoTrimCount === 0 && result.rentOptions.join() === "ALL,AVAILABLE,UNDER_3_DAYS,UNDER_1_DAY" && result.rentChip.startsWith("Rent: Under 1 day") && result.trimHeading === "Coast Armor Trim" && result.identifierFits && !result.horizontalOverflow);
  console.log(JSON.stringify({ target: marketUrl, desktop, mobile, browserErrors, passed: checks && browserErrors.length === 0 }, null, 2));
  if (!checks || browserErrors.length) process.exitCode = 1;
} finally {
  socket.close(); chromeProcess.kill();
}
