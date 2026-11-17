/* Native-browser checks for result-scoped parameter symbols and definitions. */
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
const tooltip=()=>page.locator('#parameter-tooltip');
const trigger=(id,symbol,where='')=>row(id).locator((where?where+' ':'')+'[data-parameter="'+symbol+'"]').first();
async function hidden(){await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#parameter-tooltip')||!document.querySelector('#parameter-tooltip').getClientRects().length,{},{timeout:5000});}
async function explained(target,{symbol,description}){
  await target.scrollIntoViewIfNeeded();await page.waitForTimeout(140);await page.mouse.move(0,0);await target.hover();await page.waitForFunction(()=>document.querySelector('#parameter-tooltip')?.getClientRects().length,{},{timeout:5000});
  assert.equal(await tooltip().getAttribute('role'),'tooltip');assert.equal(await tooltip().getAttribute('data-parameter'),symbol);assert.ok((await tooltip().textContent()).includes(description));
  const geometry=await tooltip().evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight};});assert.ok(geometry.left>=-1&&geometry.right<=geometry.width+1&&geometry.top>=-1&&geometry.bottom<=geometry.height+1,'tooltip remains inside the viewport');
}
async function capture(name){
  const state=await page.evaluate(()=>{const area=document.querySelector('dialog[open] #dialog-content')||document.querySelector('.view:not([hidden])'),visible=e=>e.getClientRects().length&&e.getBoundingClientRect().width>0;return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,overflow:[...area.querySelectorAll('td,th,.metric,.detail-definition dd')].filter(e=>visible(e)&&e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className,text:e.textContent.slice(0,80)})),mathErrors:document.querySelectorAll('[data-math-error],[data-mml-node="merror"]').length};});report.contexts.push({name,...state});assert.ok(state.pageWidth<=state.width+1);assert.deepEqual(state.overflow,[]);assert.equal(state.mathErrors,0);
}
async function audit(name){
  if(!process.env.ATLAS_AXE)return;
  if(!await page.evaluate(()=>!!window.axe))await page.addScriptTag({path:process.env.ATLAS_AXE});
  const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));const violations=result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));report.accessibility.push({name,violations});
}
function parseCsv(csv){csv=csv.replace(/^\uFEFF/,'');const records=[];let row=[],cell='',quoted=false;for(let i=0;i<csv.length;i++){const ch=csv[i];if(ch==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell='';}else if(ch==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));records.push(row);row=[];cell='';}else cell+=ch;}if(cell||row.length){row.push(cell);records.push(row);}const fields=records.shift();return records.map(row=>Object.fromEntries(fields.map((field,i)=>[field,row[i]])));}
(async()=>{
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
  server=createServer((req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/atlas\//,'').replace(/^\//,'')||'index.html',file=resolve(root,relative.endsWith('/')?relative+'index.html':relative);if(!file.startsWith(root+'/'))return res.writeHead(403).end();res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port,base=origin+'/atlas/';
  browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.ATLAS_BROWSER?{executablePath:process.env.ATLAS_BROWSER}:{})});report.browser=await browser.version();
  const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce',hasTouch:true});
  await context.route('**/*',route=>{if(route.request().url().startsWith(origin)||route.request().url().startsWith('file:'))return route.continue();report.errors.push('External runtime request: '+route.request().url());return route.abort();});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(base,{waitUntil:'networkidle'});await ready();const data=await page.evaluate(()=>ATLAS_DATA),named=data.results.filter(r=>r.roundParameters);
  await check('Every named round function displays mathematical symbols with a result-scoped definition',async()=>{
    report.namedRoundFunctions=named.length;
    for(const result of named){
      const bound=row(result.id).locator('.round-bound');assert.equal(await bound.getAttribute('aria-label'),result.roundsDisplay);
      assert.doesNotMatch(result.roundsDisplay,/degree|density|accuracy|radius|cost|expansion|function|genus|class|arboricity|degeneracy/i,result.id+' uses symbols');
      for(const parameter of result.roundParameters){const target=bound.locator('.parameter-token[data-parameter="'+parameter.symbol+'"]');assert.equal(await target.count(),1,result.id+' '+parameter.symbol);assert.ok(await target.getAttribute('data-parameter-description'));assert.ok((result.parameterDefinitions||[]).some(d=>d.symbol===parameter.symbol));}
      const head=result.roundsDisplay.slice(0,result.roundsDisplay.indexOf('('));assert.equal(await bound.locator('.parameter-token').first().getAttribute('data-parameter'),head,result.id+' visible outer function agrees with the label');assert.equal(await bound.locator('.function-mark').first().getAttribute('aria-label'),'(');
    }
    assert.equal(await row('gen-aprsu10-matching').locator('.round-bound').getAttribute('aria-label'),'f(Δ, ε)');
    assert.equal(await row('gen-p26-density').locator('.round-bound').getAttribute('aria-label'),'f(d, ∇₁, ε)');
    assert.equal(await row('gen-asw26-cover-random').locator('.round-bound').getAttribute('aria-label'),'f(ρ, b, ε)');
    await capture('all symbol-only functions');
  });
  await check('Hover and keyboard focus explain symbols in context and Escape dismisses the tooltip',async()=>{
    const cases=[{id:'gen-p26-density',symbol:'d',match:/average degree/i},{id:'gen-bdgpsw26-localgenus',symbol:'d',match:/asymptotic dimension/i},{id:'gen-aprsu10-matching',symbol:'Δ',match:/degree/i},{id:'gen-asw26-cover-random',symbol:'b',match:/cost/i}];
    for(const item of cases){
      const target=trigger(item.id,item.symbol,'.round-bound'),description=await target.getAttribute('data-parameter-description');assert.match(description,item.match);await explained(target,{symbol:item.symbol,description});await hidden();
      await target.focus();await page.waitForFunction(()=>document.querySelector('#parameter-tooltip')?.getClientRects().length);assert.ok((await tooltip().textContent()).includes(description));await hidden();assert.equal(await target.evaluate(e=>e===document.activeElement),true,'Escape keeps the parameter focused');
    }
    const degree=await trigger('gen-p26-density','d','.round-bound').getAttribute('data-parameter-description'),dimension=await trigger('gen-bdgpsw26-localgenus','d','.round-bound').getAttribute('data-parameter-description');assert.notEqual(degree,dimension);
    await capture('context-sensitive hover and focus');await audit('parameter definitions in catalog');
  });
  await check('MathJax coefficient and round symbols have accessible HTML targets without changing formula labels',async()=>{
    const result=data.results.find(r=>r.id==='amiri-locally-embeddable'),formula=row(result.id).locator('.approx-cell > .math');assert.equal(await formula.getAttribute('aria-label'),result.approximationDisplay);
    for(const symbol of ['c','t']){const target=trigger(result.id,symbol,'.approx-cell'),description=await target.getAttribute('data-parameter-description');assert.equal(await target.getAttribute('role'),'term');assert.ok(description);assert.match(description,symbol==='c'?/integer|density|∇/i:/minor|K.*3/i);await explained(target,{symbol,description});await hidden();}
    for(const item of [{id:'gen-aprsu10-matching',symbol:'ε',where:'.approx-cell',meaning:/accuracy|error|approximation/i},{id:'gen-fk25-path-lower',symbol:'n',where:'.round-cell',meaning:/vertices|nodes|size/i}]){const target=trigger(item.id,item.symbol,item.where),description=await target.getAttribute('data-parameter-description');assert.match(description,item.meaning);await explained(target,{symbol:item.symbol,description});await hidden();}
    const expansion=data.results.find(r=>r.id==='pic-girth-pruning').parameterDefinitions.find(d=>/^f(?:\(.+\))?$/.test(d.symbol));assert.ok(expansion,'the expansion function has its own definition');const expansionTarget=trigger('pic-girth-pruning',expansion.symbol,'.approx-cell');await explained(expansionTarget,{symbol:expansion.symbol,description:expansion.description});await hidden();
    assert.equal(await formula.locator('mjx-container').first().getAttribute('aria-hidden'),'true');
    const outside=await formula.locator('.parameter-hitbox').evaluateAll(es=>es.every(e=>!e.closest('svg')));assert.equal(outside,true,'HTML targets remain outside the cached SVG markup');
    await capture('coefficient formula targets');
  });
  await check('Definitions remain available in result details and comparisons, including narrow layouts',async()=>{
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:1100});await row('amiri-locally-embeddable').locator('.problem-button').click();await ready();
      const target=page.locator('#detail-dialog .detail-metrics [data-parameter="c"]').first();await explained(target,{symbol:'c',description:await target.getAttribute('data-parameter-description')});await capture('details tooltip '+width);await hidden();await page.locator('#dialog-close').click();
      for(const id of ['gen-p26-density','gen-bdgpsw26-localgenus'])await page.locator('[data-select="'+id+'"]').check();await page.locator('#compare-open').click();await ready();
      const ds=[page.locator('.compare-table td:nth-child(2) [data-parameter="d"]').first(),page.locator('.compare-table td:nth-child(3) [data-parameter="d"]').first()];for(const target of ds)assert.equal(await target.count(),1);const descriptions=await Promise.all(ds.map(target=>target.getAttribute('data-parameter-description')));assert.match(descriptions[0],/average degree/i);assert.match(descriptions[1],/asymptotic dimension/i);
      await explained(ds[1],{symbol:'d',description:descriptions[1]});await capture('comparison tooltip '+width);if(width===390)await audit('mobile parameter tooltip in comparison');await hidden();await page.locator('#dialog-close').click();await page.locator('#compare-clear').click();
    }
  });
  await check('Touch taps reveal and dismiss the explanation while normal result buttons still open details',async()=>{
    await page.setViewportSize({width:390,height:1100});const target=trigger('gen-aprsu10-matching','Δ','.round-bound');await target.scrollIntoViewIfNeeded();await target.tap();await page.waitForFunction(()=>document.querySelector('#parameter-tooltip')?.getClientRects().length);assert.equal(await tooltip().getAttribute('data-parameter'),'Δ');assert.equal(await page.locator('#detail-dialog').evaluate(e=>e.open),false);
    await page.locator('#search').tap();await page.waitForFunction(()=>!document.querySelector('#parameter-tooltip')?.getClientRects().length);
    await row('gen-aprsu10-matching').locator('.problem-button').click();assert.equal(await page.locator('#detail-dialog').evaluate(e=>e.open),true);await page.locator('#dialog-close').click();await capture('touch definitions');
  });
  await check('Reduction recipes and computed applications retain their distinct parameter meanings',async()=>{
    await page.setViewportSize({width:1440,height:1100});await page.locator('[data-view="reductions"]').click();await page.locator('#reductions-body [data-reduction-select="mds-to-local-covering"]').click();await ready();
    for(const item of [{symbol:'T',where:'.reduction-runtime',meaning:/round complexity/i},{symbol:'α',where:'.reduction-guarantee',meaning:/approximation ratio/i}]){const target=page.locator('#reduction-detail '+item.where+' [data-parameter="'+item.symbol+'"]').first(),description=await target.getAttribute('data-parameter-description');assert.match(description,item.meaning);await explained(target,{symbol:item.symbol,description});await hidden();}
    const density=page.locator('.reduction-application-row .parameter-token[data-parameter="ρ"]').first(),description=await density.getAttribute('data-parameter-description');assert.match(description,/minor/i);await explained(density,{symbol:'ρ',description});await capture('reduction and application parameter contexts');await hidden();await page.locator('[data-view="catalog"]').click();await ready();
  });
  await check('CSV keeps source expressions and exports symbol descriptions; the feature also works offline',async()=>{
    await page.setViewportSize({width:1440,height:1100});await page.locator('#search').fill('Picavet');await ready();
    const pending=page.waitForEvent('download');await page.locator('#export').click();const download=await pending,records=parseCsv(readFileSync(await download.path(),'utf8'));assert.ok(records.length);
    for(const record of records){const original=data.results.find(r=>r.id===record.id);assert.equal(record.rounds,original.rounds);assert.equal(record.approximation,original.approximation);assert.deepEqual(JSON.parse(record.parameterDefinitions),original.parameterDefinitions);}
    await page.goto(pathToFileURL(resolve(root,'index.html')).href+'#catalog',{waitUntil:'load'});await ready();const target=trigger('gen-p26-density','d','.round-bound');await explained(target,{symbol:'d',description:await target.getAttribute('data-parameter-description')});await capture('offline parameter tooltip');
  });
  mkdirSync(output,{recursive:true});await page.setViewportSize({width:1440,height:1100});await row('gen-p26-density').locator('.problem-button').click();await ready();const target=page.locator('#detail-dialog .round-bound [data-parameter="∇₁"], #detail-dialog .setting-section [data-parameter="∇₁"]').first();await explained(target,{symbol:'∇₁',description:await target.getAttribute('data-parameter-description')});await page.locator('#detail-dialog').screenshot({path:resolve(output,'parameter-definitions.png')});
  assert.deepEqual(report.accessibility.filter(a=>a.violations.length),[],'all parameter tooltip accessibility audits pass');assert.deepEqual(report.errors,[]);console.log('Parameter QA complete:',report.checks.length,'groups;',report.contexts.length,'layout contexts;',report.accessibility.length,'accessibility audits.');
})().catch(error=>{report.failure=error.message;console.error(error);process.exitCode=1;}).finally(async()=>{mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'parameter-browser-report.json'),JSON.stringify(report,null,2)+'\n');if(browser)await browser.close();if(server)await new Promise(done=>server.close(done));});
