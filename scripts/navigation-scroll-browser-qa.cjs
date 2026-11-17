/* Native-browser regressions for tab navigation and intentional in-page jumps. */
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT||'playwright');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {pathToFileURL}=require('node:url');
const {createServer}=require('node:http');
const {createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'..'),dist=resolve(root,'dist'),out=resolve(root,'qa');
const inputs=['dist/index.html','dist/style.css','dist/app.js'];
const fingerprint=()=>createHash('sha256').update(Buffer.concat(inputs.map(p=>readFileSync(resolve(root,p))))).digest('hex');
const report={checked:new Date().toISOString(),sourceHashInputs:inputs,sourceHash:fingerprint(),checks:[],contexts:[],errors:[],externalRequests:[]};
const views=['explorer','reductions','bibliography','about','catalog'];
let browser,server,page;
const ready=async()=>{await page.evaluate(()=>AtlasMath.render());await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
const geometry=()=>page.evaluate(()=>({scrollY,headerTop:document.querySelector('.site-header').getBoundingClientRect().top,mainTop:document.querySelector('main').getBoundingClientRect().top,focus:document.activeElement.id,view:document.body.dataset.currentView,current:document.querySelector('.primary-nav [aria-current="page"]')?.dataset.view,hash:location.hash,pageWidth:document.documentElement.scrollWidth,width:innerWidth}));
async function topState(label,view,focus=true){
  await ready();const state=await geometry();report.contexts.push({label,...state});
  assert.equal(state.scrollY,0,label+': document stays at top');
  assert.equal(state.headerTop,0,label+': full header visible');
  assert.equal(state.view,view);assert.equal(state.current,view);
  assert.ok(state.hash.startsWith('#'+view),label+': correct shareable location');
  assert.ok(state.pageWidth<=state.width+1,label+': page contained');
  if(focus)assert.equal(state.focus,'main',label+': content receives keyboard focus');
}
async function check(name,run){await run();report.checks.push(name);console.log('PASS',name);}
async function contextFor(viewport,base,origin){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});
  await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin))return route.continue();report.externalRequests.push(url);return route.abort();});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(base+'#catalog',{waitUntil:'networkidle'});await ready();return context;
}
(async()=>{
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
  server=createServer((req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/atlas\//,'').replace(/^\//,'')||'index.html',file=resolve(dist,relative.endsWith('/')?relative+'index.html':relative);if(!file.startsWith(dist+'/'))return res.writeHead(403).end();res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port,base=origin+'/atlas/';
  browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.ATLAS_BROWSER?{executablePath:process.env.ATLAS_BROWSER}:{})});report.browser=await browser.version();mkdirSync(out,{recursive:true});
  for(const width of [1440,390,320]){
    const context=await contextFor({width,height:width<600?844:900},base,origin);
    await check('Pointer tab navigation keeps the full header at '+width+'px',async()=>{
      for(const view of views){await page.locator('[data-view="'+view+'"]').click();await topState('pointer '+view+' '+width,view);}
      await page.locator('.brand').click();await topState('brand home '+width,'catalog');
    });
    await check('Keyboard tabs and same-tab activation return to top at '+width+'px',async()=>{
      for(const view of views){await page.locator('[data-view="'+view+'"]').focus();await page.keyboard.press('Enter');await topState('keyboard '+view+' '+width,view);}
      await page.locator('[data-view="about"]').click();await ready();
      for(const view of ['about','bibliography']){
        await page.evaluate(()=>scrollTo({top:500,left:0,behavior:'instant'}));assert.ok(await page.evaluate(()=>scrollY)>100,'long page actually scrolled');
        await page.locator('[data-view="'+view+'"]').evaluate(e=>e.focus({preventScroll:true}));await page.keyboard.press('Enter');await topState('from scrolled page to '+view+' '+width,view);
      }
    });
    await check('Skip link and explicit network jumps still reach content at '+width+'px',async()=>{
      await page.locator('.skip-link').focus();await page.keyboard.press('Enter');await ready();let state=await geometry();assert.equal(state.focus,'main');assert.ok(state.scrollY>0,'skip link deliberately scrolls content');
      await page.locator('[data-view="reductions"]').click();await topState('reset before graph jump '+width,'reductions');
      await page.locator('[data-network-focus]').click();await ready();state=await geometry();assert.equal(state.view,'explorer');assert.ok(state.scrollY>100,'graph jump scrolls past matrix');assert.equal(state.focus,'class-focus-picker');
      const graphTop=await page.locator('#class-network-section').evaluate(e=>e.getBoundingClientRect().top);assert.ok(graphTop>=0&&graphTop<80,'graph heading is visible near top');
      await page.goto(base+'#catalog?problem='+encodeURIComponent('Minimum dominating set'),{waitUntil:'networkidle'});await ready();
      const jump=page.locator('[data-problem-network-focus]');assert.ok(await jump.count(),'problem context supplies real network jump');await jump.click();await ready();state=await geometry();assert.equal(state.view,'explorer');assert.equal(state.focus,'problem-focus');assert.ok(state.scrollY>100,'problem jump scrolls past matrix');
      const problemTop=await page.locator('#problem-network-section').evaluate(e=>e.getBoundingClientRect().top);assert.ok(problemTop>=0&&problemTop<80,'problem heading is visible near top');
      await page.locator('[data-view="about"]').click();await topState('after explicit jumps '+width,'about');await page.screenshot({path:resolve(out,'navigation-scroll-'+width+'.png')});
    });
    await check('History and direct links retain correct pages at '+width+'px',async()=>{
      await page.locator('[data-view="explorer"]').click();await topState('history explorer '+width,'explorer');
      await page.locator('[data-view="bibliography"]').click();await topState('history bibliography '+width,'bibliography');
      await page.goBack();await topState('back '+width,'explorer',false);await page.goForward();await topState('forward '+width,'bibliography',false);
      await page.goto(base+'#about',{waitUntil:'networkidle'});await topState('direct Guide '+width,'about',false);
      await page.goto(base+'#catalog?problem=MDS',{waitUntil:'networkidle'});await topState('direct filtered reference '+width,'catalog',false);
    });
    if(width===1440)await check('Explicit reduction links still open and scroll to the construction',async()=>{
      const id=await page.evaluate(()=>ATLAS_DATA.results.find(r=>r.verification==='derived'&&r.reductionSteps?.length)?.id);assert.ok(id,'computed result exists');
      await page.goto(base+'#catalog?result='+encodeURIComponent(id),{waitUntil:'networkidle'});await ready();assert.ok(await page.locator('#detail-dialog').evaluate(e=>e.open));
      await page.locator('#dialog-content [data-reduction-open]').first().click();await ready();const state=await geometry();assert.equal(state.view,'reductions');assert.ok(state.scrollY>100);const target=await page.locator('#reduction-detail').evaluate(e=>e.getBoundingClientRect().top);assert.ok(target>=0&&target<80);assert.equal(await page.locator('#detail-dialog').evaluate(e=>e.open),false);
    });
    await context.close();
  }
  await check('Fresh offline file loading and tab navigation stay at the top',async()=>{
    const file=pathToFileURL(resolve(dist,'index.html')).href,context=await contextFor({width:390,height:844},file,'file:');
    for(const view of views){await page.locator('[data-view="'+view+'"]').click();await topState('offline '+view,view);}await context.close();
  });
  report.endSourceHash=fingerprint();assert.equal(report.endSourceHash,report.sourceHash,'production source stayed unchanged during QA');assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);report.success=true;console.log('Navigation QA passed:',report.checks.length,'groups;',report.contexts.length,'top-of-page states.');
})().catch(e=>{report.failure=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'navigation-scroll-report.json'),JSON.stringify(report,null,2)+'\n');if(browser)await browser.close();if(server)await new Promise(done=>server.close(done));});
