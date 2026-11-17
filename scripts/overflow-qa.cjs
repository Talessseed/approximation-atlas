/* Optional real-browser cell containment regression. Dependencies stay outside dist/.
 * ATLAS_PLAYWRIGHT / ATLAS_BROWSER select Playwright and its browser.
 * Set ATLAS_AXE to axe.min.js to include accessibility audits. */
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT||'playwright');
const {readFileSync,writeFileSync,mkdirSync,existsSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {createServer}=require('node:http');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'../dist'),output=resolve(__dirname,'../qa');
const formulaSelector='.round-bound,.approx-cell>.math,.compare-table td>.math,.reduction-derived-guarantee>.math,.folklore-note>.math,.metric>.math,.reduction-detail-metrics .math';
const report={checked:new Date().toISOString(),contexts:[],keyboard:[],accessibility:[],errors:[]};
let browser,server,page,probeId=0;
mkdirSync(output,{recursive:true});
const mathReady=()=>page.evaluate(()=>window.AtlasMath.render());
async function capture(context,{keyboard=false,print=false}={}){
  const state=await page.evaluate(({selector,probe,print})=>{
    const area=document.querySelector('dialog[open] #dialog-content')||document.querySelector('.view:not([hidden])');
    const visible=e=>!!e.getClientRects().length&&e.getBoundingClientRect().width>0;
    const describe=e=>({tag:e.tagName,class:e.className,result:e.closest('tr')?.querySelector('.problem-button')?.dataset.result||e.closest('tr')?.id||'',text:(e.getAttribute('aria-label')||e.textContent).trim().slice(0,100),client:e.clientWidth,scroll:e.scrollWidth});
    const cells=[...area.querySelectorAll('td,th,.metric,.detail-metrics,.detail-definition dd,.folklore-note')];
    if(area.id==='dialog-content')cells.push(area);
    const overflow=cells.filter(e=>visible(e)&&e.scrollWidth>e.clientWidth+2).map(describe);
    const formulas=[...area.querySelectorAll(selector)].filter(visible);
    const scrollers=formulas.filter(e=>/auto|scroll/.test(getComputedStyle(e).overflowX)&&e.scrollWidth>e.clientWidth+2);
    const focusIssues=print?[]:scrollers.filter(e=>e.tabIndex<0).map(describe);
    const clipping=print?formulas.filter(e=>/hidden|clip|auto|scroll/.test(getComputedStyle(e).overflowX)&&e.scrollWidth>e.clientWidth+2).map(describe):[];
    const svgOverflow=print?[...area.querySelectorAll('.math svg')].filter(visible).filter(e=>{const owner=e.closest('td,th,.metric,.folklore-note');if(!owner)return false;const a=e.getBoundingClientRect(),b=owner.getBoundingClientRect();return a.left<b.left-2||a.right>b.right+2;}).map(e=>({formula:e.closest('[aria-label]')?.getAttribute('aria-label')||'',width:e.getBoundingClientRect().width})):[];
    scrollers.sort((a,b)=>(b.scrollWidth-b.clientWidth)-(a.scrollWidth-a.clientWidth));
    if(scrollers[0])scrollers[0].setAttribute('data-overflow-probe',probe);
    return {pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,cellCount:cells.length,overflow,scrollerCount:scrollers.length,focusIssues,clipping,svgOverflow,probe:scrollers.length?probe:null};
  },{selector:formulaSelector,probe:String(++probeId),print});
  report.contexts.push({...context,print,...state});
  if(keyboard&&state.probe)await checkKeyboard(state.probe,context);
}
async function checkKeyboard(probe,context){
  const element=page.locator('[data-overflow-probe="'+probe+'"]');
  await element.evaluate(e=>{e.scrollLeft=0;e.scrollIntoView({block:'center',inline:'center'});});
  await element.focus();
  assert.ok(await element.evaluate(e=>e===document.activeElement),'formula can receive keyboard focus');
  const extent=await element.evaluate(e=>e.scrollWidth-e.clientWidth);
  for(let i=0;i<Math.min(300,Math.ceil(extent/16)+10);i++)await element.press('ArrowRight');
  await page.waitForFunction(e=>e.scrollLeft>=e.scrollWidth-e.clientWidth-2,await element.elementHandle(),{timeout:2000});
  report.keyboard.push({...context,extent,reachedEnd:true});
}
async function audit(name){
  if(!process.env.ATLAS_AXE||!existsSync(process.env.ATLAS_AXE))return;
  if(!await page.evaluate(()=>!!window.axe))await page.addScriptTag({path:process.env.ATLAS_AXE});
  const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));
  report.accessibility.push({name,violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))});
}
async function catalog(base){await page.goto(base+'#catalog');await mathReady();}
async function compare(ids){
  await page.evaluate(ids=>ids.forEach(id=>{const el=document.querySelector('[data-select="'+id+'"]');el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));}),ids);
  await page.locator('#compare-open').click();await mathReady();
}
(async()=>{
  server=createServer((req,res)=>{
    try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const relative=pathname.replace(/^\/atlas\//,'').replace(/^\//,'')||'index.html';const file=resolve(root,relative.endsWith('/')?relative+'index.html':relative);if(!file.startsWith(root+'/'))return res.writeHead(403).end();const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'}).end(readFileSync(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,base=origin+'/atlas/';
  browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.ATLAS_BROWSER?{executablePath:process.env.ATLAS_BROWSER}:{})});
  report.browser=await browser.version();
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('**/*',route=>{if(route.request().url().startsWith(origin))return route.continue();report.errors.push('External runtime request: '+route.request().url());return route.abort();});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await catalog(base);const data=await page.evaluate(()=>ATLAS_DATA);
  assert.equal(await page.locator('.result-row').count(),data.results.length,'all results participate in the layout audit');
  assert.equal(await page.locator('.approx-cell > [data-math-ready]').count(),data.results.length,'audit rendered MathJax rather than fallback labels');
  for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:1000});await mathReady();await capture({view:'catalog',width,results:data.results.length},{keyboard:width===1440});}
  await audit('catalog with long formulas');
  // Changing viewport must refresh the formula tab stops, without manual typesetting.
  await page.setViewportSize({width:390,height:1000});await page.waitForTimeout(200);await capture({view:'catalog after resize',width:390});
  await page.locator('[data-view="explorer"]').click();await mathReady();
  for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:1000});await mathReady();await capture({view:'explorer matrix',width});}
  await page.locator('[data-view="reductions"]').click();await mathReady();
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    for(const entry of data.reductions.entries){await page.evaluate(id=>document.querySelector('#reductions-body [data-reduction-select="'+id+'"]').click(),entry.id);await mathReady();await capture({view:'reductions',recipe:entry.id,width},{keyboard:width===390&&entry.id==='edge-domination-to-domination'});}
  }
  const offenders=['pic-girth-sublinear-lower','planar-k-dom-lower','gen-emr14-weighted','dory-arboricity-lower','derived-gen-as10-setcover--edge-domination-to-domination--mds-to-set-cover','gen-beks19-full-eps','gen-beks18-full-eps'];
  const dialogIds=[...new Set([...offenders,...data.results.filter(r=>r.attribution==='folklore').map(r=>r.id)])];
  const comparisonIds=['gen-beks19-full-eps','derived-gen-as10-setcover--edge-domination-to-domination--mds-to-set-cover','pic-girth-sublinear-lower','dory-arboricity-lower'];
  await catalog(base);
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});
    for(const id of dialogIds){await page.evaluate(id=>document.querySelector('.problem-button[data-result="'+id+'"]').click(),id);await mathReady();await capture({view:'result dialog',result:id,width},{keyboard:width===320&&id==='folklore-tree-mds'});await page.locator('#dialog-close').click();}
    await compare(comparisonIds);await capture({view:'comparison',width},{keyboard:width===390});
    if(width===390){await audit('comparison with long formulas');await page.locator('#detail-dialog').evaluate(e=>{e.scrollTop=0;e.querySelectorAll('.table-scroll').forEach(t=>t.scrollLeft=0);});await page.locator('#detail-dialog').screenshot({path:resolve(output,'overflow-comparison.png')});}
    await page.locator('#dialog-close').click();await page.locator('#compare-clear').click();
  }
  await page.setViewportSize({width:1024,height:1000});await page.emulateMedia({media:'print'});await mathReady();await capture({view:'catalog print',width:1024},{print:true});
  await page.emulateMedia({media:'screen'});await compare(comparisonIds);await page.emulateMedia({media:'print'});await mathReady();await capture({view:'comparison print',width:1024},{print:true});
  await page.emulateMedia({media:'screen'});await page.locator('#dialog-close').click();await mathReady();
  const failed=report.contexts.filter(c=>c.overflow.length||c.focusIssues.length||c.clipping.length||c.svgOverflow.length||(!c.print&&c.pageWidth>c.viewport+1));
  assert.deepEqual(failed,[],'cell/page/formula containment: '+JSON.stringify(failed));
  assert.ok(report.keyboard.length>=2,'representative wide formulas accept keyboard scrolling');
  assert.ok(report.accessibility.every(a=>a.violations.length===0),'accessibility: '+JSON.stringify(report.accessibility));
  assert.deepEqual(report.errors,[]);
  console.log('PASS overflow QA:',report.contexts.length,'contexts;',report.keyboard.length,'keyboard scroll checks;',report.accessibility.length,'accessibility audits.');
})().catch(error=>{report.failure=error.message;console.error(error);process.exitCode=1;}).finally(async()=>{
  writeFileSync(resolve(output,'overflow-report.json'),JSON.stringify(report,null,2)+'\n');
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
});
