/* Native-browser measurements and regressions for the compact reference layout. */
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT||'playwright');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {createServer}=require('node:http');
const {createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'../dist'),output=resolve(__dirname,'../qa');
const baselineMode=process.argv.includes('--baseline');
const measurementMode=process.argv.includes('--measure');
const sizes=[{width:1440,height:900},{width:1920,height:1080},{width:390,height:844},{width:320,height:800}];
const report={checked:new Date().toISOString(),mode:baselineMode?'baseline':measurementMode?'measurement':'compact',checks:[],contexts:[],accessibility:[],errors:[]};
let browser,server,page;
const ready=()=>page.evaluate(()=>AtlasMath.render());
const check=async(name,run)=>{await run();report.checks.push(name);console.log('PASS',name);};
async function capture(name){
  const state=await page.evaluate(()=>{const area=document.querySelector('dialog[open] #dialog-content')||document.querySelector('.view:not([hidden])'),visible=e=>e.getClientRects().length&&e.getBoundingClientRect().width>0;return {width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,bodyFont:parseFloat(getComputedStyle(document.body).fontSize),overflow:[...area.querySelectorAll('td,th,.metric,.detail-definition dd,.reference-actions,.network-toolbar')].filter(e=>visible(e)&&e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className,text:e.textContent.slice(0,80),width:e.clientWidth,scroll:e.scrollWidth})),mathErrors:document.querySelectorAll('[data-math-error],[data-mml-node="merror"]').length};});
  report.contexts.push({name,...state});assert.ok(state.pageWidth<=state.width+1,name+': page fits');assert.deepEqual(state.overflow,[],name+': cells and controls fit');assert.equal(state.bodyFont,18,'readable 120% base retained');assert.equal(state.mathErrors,0);
}
async function audit(name){
  if(!process.env.ATLAS_AXE)return;if(!await page.evaluate(()=>!!window.axe))await page.addScriptTag({path:process.env.ATLAS_AXE});
  const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));const violations=result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));report.accessibility.push({name,violations});assert.deepEqual(violations,[]);
}
async function measure(){
  await page.evaluate(()=>{scrollTo(0,0);const s=document.querySelector('#result-scroll');s.scrollTop=0;s.scrollLeft=0;});
  await page.waitForTimeout(100);
  return page.evaluate(()=>{
    const rectangle=e=>{if(!e||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return {top:r.top,left:r.left,width:r.width,height:r.height,bottom:r.bottom};};
    const scroll=document.querySelector('#result-scroll'),box=scroll.getBoundingClientRect(),head=document.querySelector('.results-table thead').getBoundingClientRect();
    const top=Math.max(0,box.top,head.bottom),bottom=Math.min(innerHeight,box.bottom),rows=[...document.querySelectorAll('.result-row')].map(e=>e.getBoundingClientRect());
    return {width:innerWidth,height:innerHeight,scrollY,pageWidth:document.documentElement.scrollWidth,header:rectangle(document.querySelector('.site-header')),intro:rectangle(document.querySelector('.intro')),stats:rectangle(document.querySelector('#catalog-stats')),table:rectangle(scroll),tableHeader:rectangle(document.querySelector('.results-table thead')),visibleTableHeight:Math.max(0,bottom-Math.max(0,box.top)),visibleRows:rows.filter(r=>Math.min(r.bottom,bottom)-Math.max(r.top,top)>1).length,fullyVisibleRows:rows.filter(r=>r.top>=top-.5&&r.bottom<=bottom+.5).length,visibleRowPixels:rows.reduce((sum,r)=>sum+Math.max(0,Math.min(r.bottom,bottom)-Math.max(r.top,top)),0)};
  });
}
(async()=>{
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
  server=createServer((req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/atlas\//,'').replace(/^\//,'')||'index.html',file=resolve(root,relative.endsWith('/')?relative+'index.html':relative);if(!file.startsWith(root+'/'))return res.writeHead(403).end();res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port,base=origin+'/atlas/';
  browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.ATLAS_BROWSER?{executablePath:process.env.ATLAS_BROWSER}:{})});report.browser=await browser.version();
  const context=await browser.newContext({viewport:sizes[0],reducedMotion:'reduce',hasTouch:true});
  await context.route('**/*',route=>{if(route.request().url().startsWith(origin))return route.continue();report.errors.push('External runtime request: '+route.request().url());return route.abort();});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  mkdirSync(output,{recursive:true});
  report.sourceHash=createHash('sha256').update(readFileSync(resolve(root,'index.html'))).update(readFileSync(resolve(root,'style.css'))).update(readFileSync(resolve(root,'app.js'))).digest('hex');
  for(const size of sizes){await page.setViewportSize(size);await page.goto(base+'#catalog',{waitUntil:'networkidle'});await ready();const geometry=await measure();report.contexts.push(geometry);await page.screenshot({path:resolve(output,'compact-'+(baselineMode?'before':'after')+'-'+size.width+'.png')});console.log(JSON.stringify(geometry));}
  if(baselineMode||measurementMode){assert.deepEqual(report.errors,[]);writeFileSync(resolve(output,baselineMode?'compact-layout-baseline.json':'compact-layout-measurements.json'),JSON.stringify(report,null,2)+'\n');console.log('Compact layout '+(baselineMode?'baseline':'measurement')+' captured:',report.contexts.length,'viewports.');return;}
  report.measurements=report.contexts.slice();report.contexts=[];
  const baseline=JSON.parse(readFileSync(resolve(output,'compact-layout-baseline.json'),'utf8'));
  const data=await page.evaluate(()=>ATLAS_DATA);
  await check('Results start substantially higher and fit the viewport with more complete rows',async()=>{
    report.improvements=[];
    for(const actual of report.measurements){const before=baseline.contexts.find(c=>c.width===actual.width&&c.height===actual.height);assert.ok(before);const saved=before.table.top-actual.table.top;assert.ok(saved>=(actual.width>1020?200:400),'substantial space saved at '+actual.width);assert.ok(actual.fullyVisibleRows>=before.fullyVisibleRows+(actual.width>1020?2:1),'more complete rows at '+actual.width);assert.ok(actual.table.bottom<=actual.height-8,'result window fits without page scrolling');assert.equal(actual.scrollY,0);assert.equal(actual.pageWidth,actual.width);assert.equal(actual.intro,null,'no separate hero before results');report.improvements.push({width:actual.width,height:actual.height,previousTableTop:before.table.top,tableTop:actual.table.top,pixelsSaved:saved,previousFullRows:before.fullyVisibleRows,fullRows:actual.fullyVisibleRows,tableHeight:actual.table.height});}
  });
  await check('Direct mobile links reveal the current navigation tab without scrolling the document',async()=>{
    report.directLinks=[];
    for(const width of [320,390])for(const view of ['about','bibliography']){await page.setViewportSize({width,height:844});await page.goto(base+'#'+view,{waitUntil:'networkidle'});await ready();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const geometry=await page.locator('[data-view="'+view+'"]').evaluate(e=>{const a=e.getBoundingClientRect(),b=e.closest('.primary-nav').getBoundingClientRect();return {left:a.left,right:a.right,navLeft:b.left,navRight:b.right,visible:a.left>=b.left-1&&a.right<=b.right+1,scrollY};});report.directLinks.push({width,view,...geometry});assert.equal(geometry.visible,true,view+' current tab is visible at '+width);assert.equal(geometry.scrollY,0,'revealing navigation leaves the page at its top');}
  });
  await check('Compact filtering, search, source details and comparison retain their functionality',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(base+'#catalog');await ready();assert.equal(await page.locator('.result-row').count(),data.results.length);
    await page.locator('#sota-only').check();assert.equal(await page.locator('.result-row').count(),data.results.filter(r=>r.frontierStatus==='frontier').length);
    await page.locator('#constant-ratio-only').check();assert.equal(await page.locator('.result-row').count(),data.results.filter(r=>r.frontierStatus==='frontier'&&r.constantApproximation).length);
    await page.locator('#constant-ratio-only').uncheck();await page.locator('#sota-only').uncheck();await page.locator('#search').fill('6c²t');await ready();assert.equal(await page.locator('.result-row').count(),1);assert.equal((await page.locator('#result-count').textContent()).trim(),'1 result');await page.locator('#search').fill('no-such-bound-compact-qa');assert.equal(await page.locator('#empty').isVisible(),true);assert.equal(await page.locator('#export').isDisabled(),true);await page.locator('#reset').click();await ready();assert.equal(await page.locator('.result-row').count(),data.results.length);
    await page.locator('[data-select="folklore-regular-vc"]').check();await page.locator('[data-select="pic-large-50-dom"]').check();await page.locator('#compare-open').click();await ready();assert.equal(await page.locator('.compare-table thead th').count(),3);await capture('compact comparison');await page.locator('#dialog-close').click();await page.locator('#compare-clear').click();
    await page.locator('.problem-button[data-result="gen-aprsu10-matching"]').click();await ready();assert.ok(await page.locator('.round-complexity-detail .full-round-bound').count());await capture('compact page opens full source details');await page.locator('#dialog-close').click();
  });
  await check('Keyboard scrolling and mobile touch controls remain usable in the fitted result window',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.goto(base+'#catalog');await ready();await measure();const scroller=page.locator('#result-scroll');await scroller.focus();await scroller.press('PageDown');await page.waitForFunction(()=>document.querySelector('#result-scroll').scrollTop>0);assert.equal(await page.evaluate(()=>scrollY),0,'keyboard scroll stays in the results window');
    await page.setViewportSize({width:390,height:844});await page.goto(base+'#catalog');await ready();await page.locator('#filters-toggle').tap();assert.equal(await page.locator('#filters-toggle').getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#graph').isVisible(),true);await page.locator('#filters-toggle').tap();assert.equal(await page.locator('#filters-toggle').getAttribute('aria-expanded'),'false');
    await page.locator('#constant-ratio-only').tap();assert.equal(await page.locator('#constant-ratio-only').isChecked(),true);await page.locator('#constant-ratio-only').tap();assert.equal(await page.locator('#constant-ratio-only').isChecked(),false);await ready();
    const nav=page.locator('.primary-nav');if(await nav.evaluate(e=>e.scrollWidth>e.clientWidth+2)){const box=await nav.boundingBox(),cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width-15,y:box.y+box.height/2}]});for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width-15-i*35,y:box.y+box.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();assert.ok(await nav.evaluate(e=>e.scrollLeft>0),'touch reveals the remaining navigation tabs');}
    await page.locator('[data-view="about"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#about-view').isVisible(),true);assert.ok(await page.locator('#catalog-stats').isVisible(),'coverage moved to the guide remains available');await page.locator('[data-view="catalog"]').click();await ready();await capture('mobile touch and keyboard navigation');await audit('compact mobile reference');
  });
  await check('All views and compact action rows remain contained at mobile and responsive breakpoints',async()=>{
    for(const width of [320,390,624,625,768,1020,1280,1440,1920]){await page.setViewportSize({width,height:width<800?844:900});for(const view of ['catalog','explorer','reductions','bibliography','about']){await page.locator('[data-view="'+view+'"]').click();await ready();await capture(view+' at '+width);}}
    await page.setViewportSize({width:1440,height:900});await page.locator('[data-view="catalog"]').click();await ready();await measure();await audit('compact desktop reference');
  });
  assert.deepEqual(report.errors,[]);console.log('Compact layout QA complete:',report.checks.length,'groups;',report.contexts.length,'layout contexts;',report.accessibility.length,'accessibility audits.');
})().catch(error=>{report.failure=error.message;console.error(error);process.exitCode=1;}).finally(async()=>{if(!baselineMode&&!measurementMode){mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'compact-layout-report.json'),JSON.stringify(report,null,2)+'\n');}if(browser)await browser.close();if(server)await new Promise(done=>server.close(done));});
