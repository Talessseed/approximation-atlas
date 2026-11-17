/* Focused native-browser checks for source-linked full round complexities. */
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT||'playwright');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {createServer}=require('node:http');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'../dist'),output=resolve(__dirname,'../qa');
const report={checked:new Date().toISOString(),checks:[],contexts:[],accessibility:[],errors:[]};
let browser,server,page;
const check=async(name,run)=>{await run();report.checks.push(name);console.log('PASS',name);};
const ready=()=>page.evaluate(()=>AtlasMath.render());
const row=id=>page.locator('.problem-button[data-result="'+id+'"]').locator('xpath=ancestor::tr');
const aria=locator=>locator.evaluate(e=>e.getAttribute('aria-label')||e.querySelector('[data-math-ready][aria-label]')?.getAttribute('aria-label'));
const metric=()=>page.locator('.detail-metrics .round-complexity-detail');
async function open(id){await row(id).locator('.problem-button').click();await ready();assert.equal(await metric().count(),1);}
async function close(){if(await page.locator('#detail-dialog').evaluate(e=>e.open))await page.locator('#dialog-close').click();}
async function capture(name){
  const value=await page.evaluate(()=>{const area=document.querySelector('dialog[open] #dialog-content')||document.querySelector('.view:not([hidden])'),visible=e=>e.getClientRects().length&&e.getBoundingClientRect().width>0;return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,overflow:[...area.querySelectorAll('td,th,.metric,.detail-definition dd')].filter(e=>visible(e)&&e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className,text:e.textContent.slice(0,90),width:e.clientWidth,scroll:e.scrollWidth})),mathErrors:document.querySelectorAll('[data-math-error],[data-mml-node="merror"]').length};});report.contexts.push({name,...value});assert.ok(value.pageWidth<=value.width+1);assert.deepEqual(value.overflow,[]);assert.equal(value.mathErrors,0);
}
async function evidence(result){
  const details=result.roundComplexityDetails,note=page.locator('.round-complexity-note');
  assert.equal(await note.count(),1,result.id+' has a source explanation');
  assert.ok((await note.textContent()).includes(details.explanation));
  const urls=await note.locator('a').evaluateAll(es=>es.map(e=>e.href));for(const item of details.evidence)assert.ok(urls.includes(new URL(item.url).href),result.id+' links '+item.url);
}
async function explanation(scope,definition){
  const target=page.locator(scope+' [data-parameter="'+definition.symbol+'"]').first();assert.ok(await target.count(),'expanded formula defines '+definition.symbol);
  assert.equal(await target.getAttribute('data-parameter-description'),definition.description);
  await target.scrollIntoViewIfNeeded();await page.waitForTimeout(140);await page.mouse.move(0,0);await target.hover();await page.waitForFunction(()=>document.querySelector('#parameter-tooltip')?.getClientRects().length,{},{timeout:5000});assert.ok((await page.locator('#parameter-tooltip').textContent()).includes(definition.description));await page.keyboard.press('Escape');
}
async function audit(name){
  if(!process.env.ATLAS_AXE)return;if(!await page.evaluate(()=>!!window.axe))await page.addScriptTag({path:process.env.ATLAS_AXE});
  const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));const violations=result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));report.accessibility.push({name,violations});assert.deepEqual(violations,[]);
}
function parseCsv(csv){csv=csv.replace(/^\uFEFF/,'');const records=[];let row=[],cell='',quoted=false;for(let i=0;i<csv.length;i++){const ch=csv[i];if(ch==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell='';}else if(ch==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));records.push(row);row=[];cell='';}else cell+=ch;}if(cell||row.length){row.push(cell);records.push(row);}const fields=records.shift();return records.map(row=>Object.fromEntries(fields.map((field,i)=>[field,row[i]])));}
(async()=>{
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
  server=createServer((req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/atlas\//,'').replace(/^\//,'')||'index.html',file=resolve(root,relative.endsWith('/')?relative+'index.html':relative);if(!file.startsWith(root+'/'))return res.writeHead(403).end();res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port,base=origin+'/atlas/';
  browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.ATLAS_BROWSER?{executablePath:process.env.ATLAS_BROWSER}:{})});report.browser=await browser.version();
  const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});await context.route('**/*',route=>{if(route.request().url().startsWith(origin)||route.request().url().startsWith('file:'))return route.continue();report.errors.push('External runtime request: '+route.request().url());return route.abort();});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(base,{waitUntil:'networkidle'});await ready();const data=await page.evaluate(()=>ATLAS_DATA),results=Object.fromEntries(data.results.map(r=>[r.id,r]));
  await check('Every result has round-complexity metadata while reference-table labels remain compact',async()=>{
    const statuses=['explicit','partial','not-stated','not-extracted','impossibility'];for(const result of data.results){assert.ok(result.roundComplexityDetails,result.id);assert.ok(statuses.includes(result.roundComplexityDetails.status),result.id);}
    for(const id of ['gen-aprsu10-matching','planar-weighted-independent-2006','gen-bdgpsw26-dom','pic-thesis-genus-616','pic-large-50-dom','gen-as26-power-lower'])assert.equal(await aria(row(id).locator('.round-bound')),results[id].roundsDisplay);
    assert.equal(results['gen-aprsu10-matching'].roundsDisplay,'f(Δ, ε)');assert.equal(results['planar-weighted-independent-2006'].roundsDisplay,'polylog n');assert.equal(results['pic-large-50-dom'].roundsDisplay,'O(t)');
    assert.equal(results['gen-aprsu10-dom'].roundsDisplay,'≤ 4');assert.equal(results['gen-aprsu10-dom'].roundClass,'constant');await capture('compact reference labels');
  });
  await check('Known parameter and polylogarithmic bounds expand in details with primary evidence and parameter explanations',async()=>{
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:1100});
      for(const id of ['gen-aprsu10-matching','planar-weighted-independent-2006']){
        const result=results[id],details=result.roundComplexityDetails;assert.equal(details.status,'explicit');assert.notEqual(details.formula,result.roundsDisplay);await open(id);assert.equal(await aria(metric().locator('.round-bound')),details.formula);assert.ok(await metric().locator('svg').count());await evidence(result);
        const symbol=id==='gen-aprsu10-matching'?'K':'d',definition=details.parameters.find(p=>p.symbol===symbol);assert.ok(definition,id+' defines '+symbol);await explanation('.round-complexity-detail',definition);await capture(id+' explicit details '+width);
        if(id==='planar-weighted-independent-2006'&&width===320)await audit('expanded polylogarithmic bound at 320px');await close();
      }
    }
  });
  await check('Partial formulas preserve unknown control functions rather than inventing a closed parameter bound',async()=>{
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:1100});
      for(const id of ['gen-bdgpsw26-dom','pic-thesis-genus-616']){const result=results[id],details=result.roundComplexityDetails;assert.equal(details.status,'partial');await open(id);assert.equal(await aria(metric().locator('.round-bound')),details.formula);await evidence(result);await capture(id+' partial details '+width);await close();}
    }
  });
  await check('Unspecified parameter dependence stays explicit about its limit and never becomes a universal constant',async()=>{
    for(const width of [1440,320]){await page.setViewportSize({width,height:1100});const result=results['pic-thesis-pw2-dom'];assert.ok(['not-stated','not-extracted'].includes(result.roundComplexityDetails.status));await open(result.id);assert.equal(await aria(metric().locator('.round-bound')),'f(H)');await evidence(result);assert.doesNotMatch(await aria(metric().locator('.round-bound')),/Constant|O\(1\)/);await capture('unspecified generic H dependence '+width);await close();}
  });
  await check('Lower-bound details retain the impossible ratio and the excluded round-budget qualification',async()=>{
    const result=results['gen-as26-power-lower'];assert.equal(result.roundComplexityDetails.status,'impossibility');
    for(const width of [1440,390,320]){await page.setViewportSize({width,height:1100});await open(result.id);assert.equal(await aria(metric().locator('.round-bound')),result.roundComplexityDetails.formula);assert.equal(await page.locator('.detail-metrics .metric').first().locator('[data-math-ready][aria-label]').first().getAttribute('aria-label'),result.approximationDisplay);assert.ok(await page.locator('#detail-dialog .lower-badge').count());assert.match(await metric().textContent(),/ruled out|excluded|impossible/i);await evidence(result);await capture('excluded lower-bound budget '+width);await close();}
  });
  await check('Computed reductions display the composed full complexity and retain source provenance',async()=>{
    const derived=data.results.filter(r=>r.verification==='derived'&&r.roundComplexityDetails.derivedFrom&&['explicit','partial'].includes(r.roundComplexityDetails.status));assert.ok(derived.length,'at least one full source bound is propagated through a reduction');report.derivedComplexities=derived.length;
    const selected=derived.filter(r=>r.roundComplexityDetails.formula!==r.roundsDisplay).slice(0,3);if(!selected.length)selected.push(derived[0]);
    for(const result of selected){await page.setViewportSize({width:390,height:1100});await open(result.id);assert.equal(await aria(metric().locator('.round-bound')),result.roundComplexityDetails.formula);assert.ok(await page.locator('.derived-note').count());assert.ok((await page.locator('.derived-note').textContent()).includes('Round conversion'));assert.equal(await aria(row(result.id).locator('.round-bound')),result.roundsDisplay);await capture(result.id+' composed full complexity');await close();}
    for(const result of data.results.filter(r=>r.verification==='derived'&&r.roundComplexityDetails.status==='impossibility'))assert.doesNotMatch(result.roundComplexityDetails.formula,/\d+\s*[·*]\s*\(?Any\b/,'arbitrary-budget statements are not multiplied as numeric expressions');
  });
  await check('Previously counted schedules and stacked total/awake resources retain their presentation',async()=>{
    for(const width of [1440,320]){await page.setViewportSize({width,height:1100});await open('amiri-locally-embeddable');assert.equal(await aria(metric().locator('.round-bound')),'≤ 6');assert.equal(await page.locator('.round-count-note').count(),1);assert.equal(await page.locator('.round-complexity-note').count(),0,'the numeric audit is not duplicated');await capture('known six-round schedule '+width);await close();await open('gen-jpp26-sleep');const lines=metric().locator('.stacked-bound > [data-math-ready]');assert.equal(await lines.count(),2,'total and awake resources stay vertically stacked');const boxes=await lines.evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));assert.ok(boxes[1].top>=boxes[0].bottom-1);await capture('stacked total and awake '+width);await close();}
  });
  await check('Comparison dialogs use the same expanded complexities while preserving the algorithm settings',async()=>{
    for(const id of ['gen-aprsu10-matching','planar-weighted-independent-2006'])await page.locator('[data-select="'+id+'"]').check();
    for(const width of [1440,390,320]){await page.setViewportSize({width,height:1100});await page.locator('#compare-open').click();await ready();const bounds=page.locator('.compare-table tr').filter({has:page.locator('th[scope="row"]',{hasText:'Round complexity'})}).locator('.round-bound');assert.equal(await bounds.count(),2);for(const [index,id] of ['gen-aprsu10-matching','planar-weighted-independent-2006'].entries())assert.equal(await aria(bounds.nth(index)),results[id].roundComplexityDetails.formula);assert.ok((await page.locator('.compare-table').textContent()).includes('Round complexity'));await capture('expanded comparison '+width);await close();}await page.locator('#compare-clear').click();
  });
  await check('CSV exports full-complexity evidence without altering source expressions and details work offline',async()=>{
    await page.setViewportSize({width:1440,height:1100});const pending=page.waitForEvent('download');await page.locator('#export').click();const download=await pending,records=parseCsv(readFileSync(await download.path(),'utf8'));assert.equal(records.length,data.results.length);
    for(const record of records){const source=results[record.id];assert.equal(record.rounds,source.rounds);assert.equal(record.roundsDisplay,source.roundsDisplay);assert.deepEqual(JSON.parse(record.roundComplexityDetails),source.roundComplexityDetails);}
    const id='gen-aprsu10-matching';await page.goto(pathToFileURL(resolve(root,'index.html')).href+'#catalog?result='+id,{waitUntil:'load'});await ready();assert.equal(await aria(metric().locator('.round-bound')),results[id].roundComplexityDetails.formula);await capture('offline expanded complexity');mkdirSync(output,{recursive:true});await page.locator('#detail-dialog').screenshot({path:resolve(output,'round-complexity-details.png')});
  });
  assert.deepEqual(report.errors,[]);console.log('Round-complexity details QA complete:',report.checks.length,'groups;',report.contexts.length,'layout contexts;',report.accessibility.length,'accessibility audits.');
})().catch(error=>{report.failure=error.message;console.error(error);process.exitCode=1;}).finally(async()=>{mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'round-complexity-details-report.json'),JSON.stringify(report,null,2)+'\n');if(browser)await browser.close();if(server)await new Promise(done=>server.close(done));});
