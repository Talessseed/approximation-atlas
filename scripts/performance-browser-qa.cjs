/* Optional native performance benchmark. Each timing includes queued MathJax
 * work and two frames; use the same browser and machine for comparisons.
 * Arguments: static directory, JSON report path, label. */
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT||'playwright');
const {createServer}=require('node:http');
const {readFileSync,writeFileSync,readdirSync,statSync}=require('node:fs');
const {resolve,extname,relative}=require('node:path');
const {createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const root=resolve(process.argv[2]||resolve(__dirname,'../dist'));
const output=resolve(process.argv[3]||resolve(__dirname,'../qa/performance-current.json'));
const label=process.argv[4]||'current';
const expectedResults=JSON.parse(readFileSync(resolve(root,'data/catalog.json'),'utf8')).results.length;
const report={label,checked:new Date().toISOString(),browser:process.env.ATLAS_BROWSER||'/usr/bin/google-chrome',root,samples:[],errors:[]};
function files(dir){return readdirSync(dir).flatMap(name=>{const p=resolve(dir,name);return statSync(p).isDirectory()?files(p):[p];});}
const paths=files(root).sort();
report.staticFiles=paths.length;report.staticBytes=paths.reduce((n,p)=>n+statSync(p).size,0);
report.fingerprint=createHash('sha256').update(paths.map(p=>relative(root,p)+'\0'+createHash('sha256').update(readFileSync(p)).digest('hex')).join('\n')).digest('hex');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer((req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const file=resolve(root,path==='/'?'index.html':path.slice(1));if(!file.startsWith(root+'/'))throw Error('Invalid path');res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'}).end(readFileSync(file));}catch{res.writeHead(404).end();}});
let browser;
async function ready(page){return page.evaluate(async()=>{await window.MathJax.startup.promise;await window.AtlasMath.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {now:performance.now(),rows:document.querySelectorAll('.result-row').length,formulas:document.querySelectorAll('[data-math-ready]').length,pending:document.querySelectorAll('[data-tex]:not([data-math-ready]):not([data-math-error])').length};});}
async function action(page,name,selector,kind='click',value=''){
  const timing=await page.evaluate(async({selector,kind,value})=>{
    const e=document.querySelector(selector);if(!e)throw Error(selector+' missing');
    const start=performance.now();
    if(kind==='input'||kind==='change'){e.value=value;e.dispatchEvent(new Event(kind,{bubbles:true}));}else e.click();
    const synchronous=performance.now()-start;
    await window.AtlasMath.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return {synchronousMs:synchronous,readyMs:performance.now()-start,rows:document.querySelectorAll('.result-row').length,pending:document.querySelectorAll('[data-tex]:not([data-math-ready]):not([data-math-error])').length};
  },{selector,kind,value});
  assert.equal(timing.pending,0,name+' has pending math');return {name,...timing};
}
function summarizeProfile(profile){
  const index=new Map(profile.nodes.map(n=>[n.id,n]));
  const parent=new Map();for(const n of profile.nodes)for(const id of n.children||[])parent.set(id,n.id);
  const self=new Map(),inclusive=new Map();let total=0;
  for(let i=0;i<(profile.samples||[]).length;i++){const id=profile.samples[i],weight=profile.timeDeltas[i]||0;total+=weight;self.set(id,(self.get(id)||0)+weight);let p=id;while(p){inclusive.set(p,(inclusive.get(p)||0)+weight);p=parent.get(p);}}
  const list=(weights)=>[...weights].map(([id,us])=>{const n=index.get(id);return {name:n.callFrame.functionName||'(anonymous)',url:n.callFrame.url.replace(/^http:\/\/127\.0\.0\.1:\d+\//,''),line:n.callFrame.lineNumber+1,ms:Math.round(us/100)/10,pct:Math.round(us/total*1000)/10};}).sort((a,b)=>b.ms-a.ms).slice(0,30);
  return {totalMs:Math.round(total/100)/10,self:list(self),inclusive:list(inclusive)};
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:report.browser,headless:true,chromiumSandbox:true});
  for(const [index,width] of [1440,1440,1440,390].entries()){
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    await page.addInitScript(()=>{window.__longtasks=[];new PerformanceObserver(list=>window.__longtasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({entryTypes:['longtask']});});
    const sample={index,width,actions:[]};
    await page.goto(origin,{waitUntil:'load'});sample.startup=await ready(page);assert.equal(sample.startup.rows,expectedResults);assert.equal(sample.startup.pending,0);
    sample.startup.longtasks=await page.evaluate(()=>window.__longtasks);
    sample.startup.resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,bytes:r.encodedBodySize,durationMs:r.duration})));
    sample.actions.push(await action(page,'constant round filter','[data-round="constant"]'));
    sample.actions.push(await action(page,'reset all results','#reset'));
    sample.actions.push(await action(page,'planar class filter','#graph','change','Planar'));
    sample.actions.push(await action(page,'search planar domination','#search','input','planar dominating'));
    sample.actions.push(await action(page,'reset search','#reset'));
    sample.actions.push(await action(page,'open explorer','[data-view="explorer"]'));
    sample.actions.push(await action(page,'open reductions','[data-view="reductions"]'));
    sample.actions.push(await action(page,'return reference','[data-view="catalog"]'));
    sample.allLongtasks=await page.evaluate(()=>window.__longtasks);
    sample.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(sample.overflow,false);
    report.samples.push(sample);console.log(label,index,width,'startup',Math.round(sample.startup.now),'ms','actions',sample.actions.map(a=>a.name+':'+Math.round(a.readyMs)).join(', '));
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),cdp=await context.newCDPSession(page);
  await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');
  await page.goto(origin,{waitUntil:'load'});await ready(page);const profile=await cdp.send('Profiler.stop');report.startupProfile=summarizeProfile(profile.profile);
  await cdp.send('Profiler.start');await action(page,'reset all results','#reset');const actionProfile=await cdp.send('Profiler.stop');report.fullRenderProfile=summarizeProfile(actionProfile.profile);
  await context.close();
  report.success=report.errors.length===0;writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log('profile startup self',report.startupProfile.self.slice(0,12));console.log('profile full-render inclusive',report.fullRenderProfile.inclusive.slice(0,15));
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));
})().catch(e=>{report.failure=e.stack;writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
