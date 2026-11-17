/* Optional native-browser checks for the 120% scale and full-width reference. */
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT||'playwright');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {createServer}=require('node:http');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'../dist'),output=resolve(__dirname,'../qa');
const report={checked:new Date().toISOString(),checks:[],contexts:[],errors:[]};
let browser,server,page;
const check=async(name,run)=>{await run();report.checks.push(name);console.log('PASS',name);};
const ready=()=>page.evaluate(()=>AtlasMath.render());
async function capture(name){
  const result=await page.evaluate(()=>{
    const area=document.querySelector('dialog[open] #dialog-content')||document.querySelector('.view:not([hidden])');
    const visible=e=>e.getClientRects().length&&e.getBoundingClientRect().width>0;
    const cells=[...area.querySelectorAll('td,th,.metric,.detail-definition dd,.reduction-detail-metrics')];
    if(area.id==='dialog-content')cells.push(area);
    const overflow=cells.filter(e=>visible(e)&&e.scrollWidth>e.clientWidth+2).map(e=>({tag:e.tagName,class:e.className,text:(e.getAttribute('aria-label')||e.textContent).trim().slice(0,90),width:e.clientWidth,scroll:e.scrollWidth}));
    return {view:area.id,width:innerWidth,pageWidth:document.documentElement.scrollWidth,mainWidth:document.querySelector('main').getBoundingClientRect().width,bodyFont:parseFloat(getComputedStyle(document.body).fontSize),overflow,mathErrors:document.querySelectorAll('[data-math-error],[data-mml-node="merror"]').length};
  });
  report.contexts.push({name,...result});assert.ok(result.pageWidth<=result.width+1,name+': page width');assert.deepEqual(result.overflow,[],name+': cells and metrics');assert.equal(result.mathErrors,0,name+': MathJax');assert.equal(result.bodyFont,18,name+': proportional base size');
}
(async()=>{
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
  server=createServer((req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/atlas\//,'').replace(/^\//,'')||'index.html',file=resolve(root,relative.endsWith('/')?relative+'index.html':relative);if(!file.startsWith(root+'/'))return res.writeHead(403).end();res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'}).end(readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port,base=origin+'/atlas/';
  browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.ATLAS_BROWSER?{executablePath:process.env.ATLAS_BROWSER}:{})});report.browser=await browser.version();
  const context=await browser.newContext({viewport:{width:1440,height:1200},reducedMotion:'reduce'});
  await context.route('**/*',route=>{if(route.request().url().startsWith(origin))return route.continue();report.errors.push('External runtime request: '+route.request().url());return route.abort();});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(base,{waitUntil:'networkidle'});await ready();
  await check('Desktop typography, controls and sidebar are 120% of the original CSS sizes',async()=>{
    const metrics=await page.evaluate(()=>{
      const font=selector=>parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
      return {root:font('html'),body:font('body'),heading:font('.masthead h1'),problem:font('.problem-button'),math:font('.approx-cell > .math'),sidebar:document.querySelector('.filters').getBoundingClientRect().width,selectHeight:document.querySelector('#graph').getBoundingClientRect().height,checkbox:document.querySelector('.select-target input').getBoundingClientRect().width,search:getComputedStyle(document.querySelector('.search-box input')).fontSize};
    });report.typography=metrics;
    assert.equal(metrics.root,18);assert.equal(metrics.body,18);assert.ok(Math.abs(metrics.heading-22.5)<0.01);assert.ok(Math.abs(metrics.problem-15.6)<0.01);assert.ok(Math.abs(metrics.math-19.2)<0.01);assert.ok(Math.abs(metrics.sidebar-228)<0.1);assert.ok(Math.abs(metrics.selectHeight-43.2)<0.1);assert.ok(Math.abs(metrics.checkbox-18)<0.1);assert.equal(parseFloat(metrics.search),15.6);
    await page.setViewportSize({width:1920,height:1200});assert.ok(Math.abs((await page.locator('.filters').boundingBox()).width-252)<0.1,'large sidebar follows the scaled responsive rule');assert.equal(await page.locator('.problem-button').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)),16.8,'wide-table 14px type scales by 120%');
  });
  await check('Reference uses the available width while other views retain bounded margins across responsive widths',async()=>{
    for(const width of [320,390,624,768,1020,1280,1440,1920,2560]){
      await page.setViewportSize({width,height:1200});
      for(const view of ['catalog','explorer','reductions','bibliography','about']){
        await page.locator('[data-view="'+view+'"]').click();await ready();await capture(view+' at '+width);
        const geometry=await page.evaluate(view=>{
          const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,width:r.width,right:r.right};};
          return {main:box(document.querySelector('main')),header:box(document.querySelector('.site-header')),footer:box(document.querySelector('.site-footer')),view:box(document.querySelector('#'+view+'-view'))};
        },view);
        const gutter=view==='catalog'?(width<=624?10:20):(width<=624?16.8:width<=1440?28.8:48);
        const outerWidth=view==='catalog'?width-2*gutter:Math.min(1480,width-2*gutter),left=(width-outerWidth)/2;
        for(const key of ['main','header','footer']){assert.ok(Math.abs(geometry[key].left-left)<1,key+' centered gutter for '+view+' at '+width);assert.ok(Math.abs(geometry[key].width-outerWidth)<1,key+' expected width for '+view+' at '+width);}
        const viewWidth=Math.min(outerWidth,view==='about'?780:view==='bibliography'?1000:Infinity);
        assert.ok(Math.abs(geometry.view.width-viewWidth)<1,view+' bounded content width at '+width);
      }
    }
  });
  await check('Large formulas, source details and four-way comparisons remain usable at the larger scale',async()=>{
    const examples=['pic-girth-sublinear-lower','gen-beks18-full-eps','folklore-regular-vc','pic-large-50-dom'];
    for(const width of [320,390,1440,1920]){
      await page.setViewportSize({width,height:1200});await page.locator('[data-view="catalog"]').click();await ready();
      for(const id of examples){await page.locator('.problem-button[data-result="'+id+'"]').click();await ready();await capture(id+' detail at '+width);await page.locator('#dialog-close').click();}
      for(const id of examples)await page.locator('[data-select="'+id+'"]').check();await page.locator('#compare-open').click();await ready();await capture('four-way comparison at '+width);await page.locator('#dialog-close').click();await page.locator('#compare-clear').click();
    }
  });
  await check('Inclusion canvases keep readable 120% focus labels, dragging and zoom at desktop and mobile widths',async()=>{
    for(const width of [390,1440,1920]){
      await page.setViewportSize({width,height:1200});await page.locator('[data-view="explorer"]').click();await ready();
      for(const id of ['class-network','problem-network']){
        const network=page.locator('#'+id),viewport=network.locator('.network-viewport');await network.locator('[data-network-action="center"]').click();
        assert.ok(await network.evaluate(e=>Number(e.dataset.scale)>=1.02));
        assert.equal(await network.locator('.network-node text').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)),12,'SVG world text is enlarged by its camera rather than twice');
        await viewport.scrollIntoViewIfNeeded();const box=await viewport.boundingBox(),before=await network.evaluate(e=>({x:Number(e.dataset.panX),scale:Number(e.dataset.scale)}));
        await page.mouse.move(box.x+15,box.y+15);await page.mouse.down();await page.mouse.move(box.x+75,box.y+55,{steps:5});await page.mouse.up();assert.ok(Math.abs((await network.evaluate(e=>Number(e.dataset.panX)))-before.x)>30);
        await network.locator('[data-network-action="zoom-in"]').click();assert.ok(await network.evaluate((e,scale)=>Number(e.dataset.scale)>scale,before.scale));await capture(id+' at '+width);
      }
    }
  });
  await check('Print retains the original reference scale and returns to 120% on screen',async()=>{
    await page.setViewportSize({width:1440,height:1200});await page.locator('[data-view="catalog"]').click();await ready();await page.emulateMedia({media:'print'});
    assert.equal(await page.evaluate(()=>parseFloat(getComputedStyle(document.body).fontSize)),15);
    await page.emulateMedia({media:'screen'});await capture('screen after print');
  });
  mkdirSync(output,{recursive:true});
  for(const width of [1440,1920]){await page.setViewportSize({width,height:1200});await page.locator('[data-view="catalog"]').click();await ready();await page.screenshot({path:resolve(output,'scale-'+width+'.png')});}
  assert.deepEqual(report.errors,[]);console.log('Scale QA complete:',report.checks.length,'groups;',report.contexts.length,'layout contexts.');
})().catch(error=>{report.failure=error.message;console.error(error);process.exitCode=1;}).finally(async()=>{mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'scale-browser-report.json'),JSON.stringify(report,null,2)+'\n');if(browser)await browser.close();if(server)await new Promise(done=>server.close(done));});
