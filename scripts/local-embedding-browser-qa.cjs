/* Focused checks for the supplied local-embeddability parameters. */
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT||'playwright');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {createServer}=require('node:http');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'../dist'),output=resolve(__dirname,'../qa'),id='amiri-locally-embeddable';
const report={checked:new Date().toISOString(),checks:[],contexts:[],accessibility:[],errors:[]};
let browser,server,page;
const check=async(name,run)=>{await run();report.checks.push(name);console.log('PASS',name);};
const ready=()=>page.evaluate(()=>AtlasMath.render());
const fact=(scope,id)=>page.locator(scope+' [data-condition="'+id+'"]');
const row=()=>page.locator('.problem-button[data-result="'+id+'"]').locator('xpath=ancestor::tr');
async function mathIn(scope,labels){
  const expressions=page.locator(scope+' .condition-math');assert.deepEqual((await expressions.evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')))).sort(),labels.slice().sort());
  assert.equal(await expressions.evaluateAll(es=>es.every(e=>e.querySelector('svg')&&!e.querySelector('[data-mml-node="merror"]'))),true,'every inline expression renders without a math error');assert.equal(await expressions.evaluateAll(es=>es.every(e=>e.dataset.mathReady==='true'&&['math','group'].includes(e.getAttribute('role')))),true,'formulas retain labels and may expose their contextual parameter terms');
}
async function capture(name){
  const state=await page.evaluate(()=>{const area=document.querySelector('dialog[open] #dialog-content')||document.querySelector('.view:not([hidden])'),visible=e=>e.getClientRects().length&&e.getBoundingClientRect().width>0;return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,overflow:[...area.querySelectorAll('td,th,.metric,.detail-definition dd')].filter(e=>visible(e)&&e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className,text:e.textContent.slice(0,80)})),mathErrors:document.querySelectorAll('[data-math-error],[data-mml-node="merror"]').length};});
  report.contexts.push({name,...state});assert.ok(state.pageWidth<=state.width+1);assert.deepEqual(state.overflow,[]);assert.equal(state.mathErrors,0);
}
function parseCsv(csv){
  csv=csv.replace(/^\uFEFF/,'');const records=[];let row=[],cell='',quoted=false;
  for(let i=0;i<csv.length;i++){const ch=csv[i];if(ch==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell='';}else if(ch==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));records.push(row);row=[];cell='';}else cell+=ch;}
  if(cell||row.length){row.push(cell);records.push(row);}const fields=records.shift();return records.map(row=>Object.fromEntries(fields.map((f,i)=>[f,row[i]])));
}
(async()=>{
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
  server=createServer((req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/atlas\//,'').replace(/^\//,'')||'index.html',file=resolve(root,relative.endsWith('/')?relative+'index.html':relative);if(!file.startsWith(root+'/'))return res.writeHead(403).end();res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port,base=origin+'/atlas/';
  browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.ATLAS_BROWSER?{executablePath:process.env.ATLAS_BROWSER}:{})});report.browser=await browser.version();
  const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
  await context.route('**/*',route=>{if(route.request().url().startsWith(origin))return route.continue();report.errors.push('External runtime request: '+route.request().url());return route.abort();});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(base+'#catalog?graph=Locally+embeddable&classTransfer=0',{waitUntil:'networkidle'});await ready();
  const source=await page.evaluate(id=>ATLAS_DATA.results.find(r=>r.id===id),id);
  assert.equal(source.approximation,'6c²t + (2t + 5)c + 4');assert.equal(source.approximationDisplay,source.approximation);assert.equal(source.roundsDisplay,'≤ 6');
  await check('The table defines the excluded depth-one minor and supplied integer density bound inline, once',async()=>{
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:1100});await ready();assert.equal(await page.locator('.result-row').count(),1);
      for(const condition of ['parameter-depth-one-excluded-k3t','input-integer-depth-one-density'])assert.equal(await row().locator('[data-condition="'+condition+'"]').count(),1);
      assert.equal(await row().locator('[data-condition="parameter-depth-one-density-definition"]').count(),0,'the explanatory definition stays in details');
      const scope='.result-row .result-setting';await mathIn(scope,['K₃,ₜ','t ≥ 3','c ≥ ∇₁(G)']);
      assert.equal(await row().locator('.approx-cell > .math').getAttribute('aria-label'),source.approximation);
      assert.equal(await row().locator('.round-cell .math').getAttribute('aria-label'),'≤ 6');await capture('table '+width);
    }
  });
  await check('Details retain the density definition, integer ceiling choice and supplied-input assumptions without duplicating facts',async()=>{
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:1100});await row().locator('.problem-button').click();await ready();
      for(const condition of ['parameter-depth-one-excluded-k3t','input-integer-depth-one-density','parameter-depth-one-density-definition','detail-depth-one-integer-ceiling','input-distinct-ids','strength-no-embedding'])assert.equal(await fact('.setting-section',condition).count(),1);
      await mathIn('.setting-section',['K₃,ₜ','t ≥ 3','c ≥ ∇₁(G)','∇₁(G)','|E(H)|/|V(H)|','c=⌈∇₁(G)⌉']);
      assert.match(await fact('.setting-section','input-integer-depth-one-density').textContent(),/Known integer/);
      assert.match(await fact('.setting-section','detail-depth-one-integer-ceiling').textContent(),/if this value is supplied/);
      assert.match(await fact('.setting-section','detail-depth-one-integer-ceiling').textContent(),/A larger known integer upper bound is also allowed/);
      assert.equal(await page.locator('.original-source-fields').getAttribute('open'),null);
      const original=await page.locator('.original-source-fields').textContent();assert.ok(original.includes(source.parameters));assert.ok(original.includes(source.assumptions));assert.match(original,/supplied integer c/);
      assert.equal(await page.locator('.detail-metrics > .metric .math').first().getAttribute('aria-label'),source.approximation);
      assert.equal(await page.locator('.detail-metrics .round-bound .math').getAttribute('aria-label'),'≤ 6');await capture('details '+width);
      if(width===390){
        if(process.env.ATLAS_AXE){await page.addScriptTag({path:process.env.ATLAS_AXE});const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));const violations=result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));report.accessibility.push({name:'mobile inline parameter definitions',violations});assert.deepEqual(violations,[]);}
        mkdirSync(output,{recursive:true});await page.locator('#detail-dialog').screenshot({path:resolve(output,'local-embedding-parameters.png')});
      }
      await page.locator('#dialog-close').click();
    }
  });
  await check('CSV preserves the polynomial and source wording and resolves shared mathematical settings to plain text',async()=>{
    const pending=page.waitForEvent('download');await page.locator('#export').click();const download=await pending,records=parseCsv(readFileSync(await download.path(),'utf8'));
    assert.equal(records.length,1);const record=records[0];assert.equal(record.id,id);assert.equal(record.approximation,source.approximation);assert.equal(record.roundsDisplay,'≤ 6');assert.equal(record.parameters,source.parameters);assert.equal(record.assumptions,source.assumptions);
    const setting=JSON.parse(record.querySetting);assert.equal(setting.summary.filter(s=>s==='Known integer c ≥ ∇₁(G)').length,1);assert.equal(setting.summary.filter(s=>s==='K₃,ₜ excluded as a depth-1 minor (t ≥ 3)').length,1);assert.ok(setting.parameters.some(s=>s.includes('maximum edge density |E(H)|/|V(H)|')));assert.ok(setting.detail.some(s=>s.includes('c=⌈∇₁(G)⌉ if this value is supplied')));assert.doesNotMatch(record.querySetting,/\[object Object\]|data-tex|<svg/);
  });
  await check('Comparison uses the same inline definitions and keeps the original approximation polynomial',async()=>{
    await page.locator('[data-select="'+id+'"]').check();await page.locator('#reset').click();await page.locator('[data-select="folklore-regular-vc"]').check();
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:1100});await page.locator('#compare-open').click();await ready();
      await mathIn('.compare-table',['K₃,ₜ','t ≥ 3','c ≥ ∇₁(G)','∇₁(G)','|E(H)|/|V(H)|','c=⌈∇₁(G)⌉']);
      for(const condition of ['parameter-depth-one-excluded-k3t','input-integer-depth-one-density','parameter-depth-one-density-definition','detail-depth-one-integer-ceiling'])assert.equal(await fact('.compare-table',condition).count(),1);
      assert.equal(await page.locator('.compare-table .math[aria-label="'+source.approximation+'"]').count(),1);await capture('comparison '+width);await page.locator('#dialog-close').click();
    }
  });
  assert.deepEqual(report.errors,[]);console.log('Local embedding QA complete:',report.checks.length,'groups;',report.contexts.length,'layout contexts;',report.accessibility.length,'accessibility audits.');
})().catch(error=>{report.failure=error.message;console.error(error);process.exitCode=1;}).finally(async()=>{mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'local-embedding-parameters-report.json'),JSON.stringify(report,null,2)+'\n');if(browser)await browser.close();if(server)await new Promise(done=>server.close(done));});
