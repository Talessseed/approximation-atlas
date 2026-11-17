/* Native-browser regressions for the query-scoped Tight filter. */
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT||'playwright');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {createServer}=require('node:http');
const {createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'../dist'),output=resolve(__dirname,'../qa');
const report={checked:new Date().toISOString(),checks:[],queries:[],layouts:[],accessibility:[],errors:[]};
let browser,server,page,base;
const ready=()=>page.evaluate(()=>AtlasMath.render());
const ids=()=>page.locator('.result-row .problem-button').evaluateAll(elements=>elements.map(e=>e.dataset.result));
const check=async(name,run)=>{await run();report.checks.push(name);console.log('PASS',name);};
async function query(state={}){
  const params=new URLSearchParams(Object.entries(state).map(([key,value])=>[key,typeof value==='boolean'?(value?'1':'0'):value]));
  await page.goto(base+'#catalog'+(params.size?'?'+params:''));await ready();
  const expected=await page.evaluate(state=>{
    const papers=Object.fromEntries(ATLAS_DATA.papers.map(p=>[p.id,p]));
    const candidates=AtlasCore.filtered(ATLAS_DATA.results,papers,{...state,tight:false});
    return candidates.filter(r=>!state.tight||AtlasCore.tightApplies(r,state)).map(r=>r.id);
  },state);
  const actual=await ids();assert.deepEqual(actual,expected,JSON.stringify(state));
  if(state.tight)assert.equal(await page.locator('.result-row').evaluateAll(rows=>rows.every(row=>!!row.querySelector('.tight-badge'))),true,'each filtered row has an applicable Tight badge');
  report.queries.push({state,count:actual.length,ids:actual});return actual;
}
async function audit(name){
  if(!process.env.ATLAS_AXE)return;
  if(!await page.evaluate(()=>!!window.axe))await page.addScriptTag({path:process.env.ATLAS_AXE});
  const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));
  const violations=result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
  report.accessibility.push({name,violations});assert.deepEqual(violations,[],name);
}
function parseCsv(csv){csv=csv.replace(/^\uFEFF/,'');const records=[];let row=[],cell='',quoted=false;for(let i=0;i<csv.length;i++){const ch=csv[i];if(ch==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell='';}else if(ch==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));records.push(row);row=[];cell='';}else cell+=ch;}if(cell||row.length){row.push(cell);records.push(row);}const fields=records.shift();return records.map(row=>Object.fromEntries(fields.map((field,i)=>[field,row[i]])));}
async function download(selector){const pending=page.waitForEvent('download');await page.locator(selector).click();const file=await pending;return {filename:file.suggestedFilename(),text:readFileSync(await file.path(),'utf8')};}
(async()=>{
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
  server=createServer((req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/atlas\//,'').replace(/^\//,'')||'index.html',file=resolve(root,relative.endsWith('/')?relative+'index.html':relative);if(!file.startsWith(root+'/'))return res.writeHead(403).end();res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;base=origin+'/atlas/';
  browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.ATLAS_BROWSER?{executablePath:process.env.ATLAS_BROWSER}:{})});report.browser=await browser.version();
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',hasTouch:true});
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
  await context.route('**/*',route=>{if(route.request().url().startsWith(origin))return route.continue();report.errors.push('External runtime request: '+route.request().url());return route.abort();});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
  mkdirSync(output,{recursive:true});
  report.sourceHash=createHash('sha256').update(readFileSync(resolve(root,'index.html'))).update(readFileSync(resolve(root,'style.css'))).update(readFileSync(resolve(root,'app.js'))).update(readFileSync(resolve(root,'core.js'))).digest('hex');
  await page.goto(base,{waitUntil:'networkidle'});await ready();const data=await page.evaluate(()=>ATLAS_DATA),byId=Object.fromEntries(data.results.map(r=>[r.id,r]));
  await check('Short filter labels and help retain accessible checkbox semantics',async()=>{
    const controls=[['sota-only','SOTA','Best known for this setting.','sota-filter-help'],['tight-only','Tight','Matching upper and lower bounds for this setting.','tight-filter-help'],['constant-ratio-only','Constant ratio','A fixed factor, independent of all parameters.','constant-ratio-help']];
    for(const [id,label,help,description]of controls){const input=page.locator('#'+id),owner=input.locator('..');assert.equal(await input.isChecked(),false);assert.equal((await owner.textContent()).trim(),label);assert.equal(await owner.getAttribute('title'),help);assert.equal(await input.getAttribute('aria-label'),label+' only');assert.equal(await input.getAttribute('aria-describedby'),description);assert.equal(await page.locator('#'+description).textContent(),help);}
    assert.equal(await page.getByRole('checkbox',{name:'Tight only',exact:true}).count(),1);await audit('default compact filter controls');
  });
  await check('Tight filters both upper and lower bounds independently of SOTA and combines with other filters',async()=>{
    const all=await query({tight:true});assert.ok(all.includes('outerplanar-five')&&all.includes('outerplanar-five-lower'));assert.ok(all.includes('gen-asw26-planar'),'a dominated result may still be tight');assert.ok(!all.includes('gen-dp26-matching'),'SOTA alone does not establish tightness');
    const sota=await query({tight:true,sota:true});assert.ok(!sota.includes('gen-asw26-planar'));assert.ok(sota.length>0&&sota.length<all.length);
    for(const state of [{tight:true,bound:'upper'},{tight:true,bound:'lower'},{tight:true,constantRatio:true},{tight:true,sota:true,constantRatio:true},{tight:true,round:'logstar'},{tight:true,sort:'newest'}])await query(state);
    await query({tight:false});assert.equal(await page.locator('.result-row').count(),data.results.length);
  });
  await check('Graph, problem and model implications do not promote source-only tightness certificates',async()=>{
    for(const [id,state]of [['outerplanar-five-lower',{graph:'Planar',bound:'lower'}],['gen-fk25-path-lower',{graph:'General',bound:'lower'}],['gen-as10-vc',{model:'LOCAL',transfer:true}],['gen-ghs12-eds',{model:'CONGEST',transfer:true}]]){
      assert.ok((await query(state)).includes(id),id+' remains an applicable bound');assert.ok(!(await query({...state,tight:true})).includes(id),id+' is not tight in the enlarged setting');
    }
    assert.ok((await query({tight:true,model:'Anonymous'})).includes('gen-as10-vc'));
    assert.ok((await query({tight:true,problem:'MDS',graph:'Planar'})).includes('derived-gen-asw26-cover-det--mds-to-local-covering'),'a separately reviewed derived result is retained');
    assert.ok(!(await query({tight:true,problem:'Total dominating set',graph:'Planar'})).includes('derived-gen-asw26-cover-det--total-domination-to-local-covering'),'unreviewed reduction consequences do not inherit Tight');
  });
  await check('Tight state survives share links, reload and view history, and resets without a duplicate chip',async()=>{
    await query();await page.locator('#tight-only').check();await ready();const expected=await ids();assert.ok(new URLSearchParams(page.url().split('?')[1]).get('tight')==='1');assert.equal(await page.locator('[data-clear="tight"]').count(),0);
    await page.locator('#share').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),page.url());await page.reload({waitUntil:'networkidle'});await ready();assert.equal(await page.locator('#tight-only').isChecked(),true);assert.deepEqual(await ids(),expected);
    await page.locator('[data-view="about"]').click();await page.locator('[data-view="explorer"]').click();await page.goBack();assert.equal(await page.locator('#about-view').isVisible(),true);await page.goBack();await ready();assert.equal(await page.locator('#catalog-view').isVisible(),true);assert.deepEqual(await ids(),expected);await page.goForward();assert.equal(await page.locator('#about-view').isVisible(),true);await page.locator('[data-view="catalog"]').click();await ready();assert.equal(await page.locator('#tight-only').isChecked(),true);
    await page.locator('#tight-only').uncheck();assert.equal(await page.locator('.result-row').count(),data.results.length);await page.locator('#tight-only').check();await page.locator('#sota-only').check();await page.locator('#constant-ratio-only').check();await page.locator('#reset').click();await ready();for(const id of ['tight-only','sota-only','constant-ratio-only'])assert.equal(await page.locator('#'+id).isChecked(),false);assert.equal(await page.locator('.result-row').count(),data.results.length);assert.ok(!page.url().includes('tight='));
    await query({tight:true});await page.locator('#tight-only').focus();await page.keyboard.press('Space');assert.equal(await page.locator('#tight-only').isChecked(),false,'native keyboard activation toggles the filter');
  });
  await check('CSV and BibTeX export precisely the Tight-filtered selection and retain source metrics',async()=>{
    for(const state of [{tight:true},{tight:true,problem:'MDS',graph:'Planar'}]){
      const selected=await query(state),csv=await download('#export'),records=parseCsv(csv.text);assert.equal(csv.filename,'distributed-approximation-results.csv');assert.deepEqual(records.map(r=>r.id),selected);
      for(const record of records){assert.equal(record.tightQueryStatus,'tight');assert.equal(record.tightAppliesToQuery,'true');assert.ok(record.tightAxes);for(const field of ['rounds','roundsDisplay','approximation','paperId'])assert.equal(record[field],String(byId[record.id][field]??''),record.id+': source '+field+' unchanged');}
      const bib=await download('#export-bibtex');assert.equal(bib.filename,'distributed-approximation-results.bib');const actual=[...bib.text.matchAll(/^@\w+\{([^,]+),/gm)].map(m=>m[1]).sort(),expected=[...new Set(selected.map(id=>byId[id].paperId))].sort();assert.deepEqual(actual,expected,'BibTeX has each and only each selected source once');
      report.exports??=[];report.exports.push({state,rows:records.length,papers:actual.length});
    }
  });
  await check('Three controls fit one row on narrow screens; touch, table layout and accessibility remain intact',async()=>{
    for(const width of [320,390,1440]){
      await page.setViewportSize({width,height:width===320?800:width===390?844:900});await query({tight:true});await page.evaluate(()=>scrollTo(0,0));await page.reload({waitUntil:'networkidle'});await ready();await page.waitForTimeout(100);
      const geometry=await page.evaluate(()=>{const labels=[...document.querySelectorAll('.bound-toggles>label')].map(e=>{const r=e.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,width:r.width};}),table=document.querySelector('#result-scroll').getBoundingClientRect();return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,labels,tableTop:table.top,tableBottom:table.bottom,height:innerHeight,overflow:[...document.querySelectorAll('#catalog-view td,#catalog-view th,.reference-actions,.bound-toggles')].filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className,width:e.clientWidth,scroll:e.scrollWidth})),mathErrors:document.querySelectorAll('[data-math-error],[data-mml-node="merror"]').length};});
      report.layouts.push(geometry);assert.equal(geometry.pageWidth,width);assert.equal(geometry.labels.length,3);assert.ok(geometry.labels.every(label=>Math.abs(label.top-geometry.labels[0].top)<=1),'all three toggles share one row at '+width);assert.ok(geometry.labels.every(label=>label.left>=0&&label.right<=width),'toggle row fits '+width);assert.deepEqual(geometry.overflow,[]);assert.equal(geometry.mathErrors,0);assert.ok(geometry.tableBottom<=geometry.height-8,'compact result window still fits '+width);assert.ok(geometry.tableTop<(width<625?460:280),'compact table placement retained');
      if(width<625){assert.equal(await page.locator('.criteria-help').isVisible(),false);await page.locator('#tight-only').tap();assert.equal(await page.locator('#tight-only').isChecked(),false);await page.locator('#tight-only').tap();assert.equal(await page.locator('#tight-only').isChecked(),true);}
      if(width===320||width===1440)await audit('Tight filtered reference at '+width);
      await page.screenshot({path:resolve(output,'tight-filter-'+width+'.png')});
    }
  });
  assert.deepEqual(report.errors,[]);console.log('Tight-filter QA complete:',report.checks.length,'groups;',report.queries.length,'queries;',report.layouts.length,'viewports;',report.accessibility.length,'accessibility audits.');
})().catch(error=>{report.failure=error.message;console.error(error);process.exitCode=1;}).finally(async()=>{mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'tight-filter-report.json'),JSON.stringify(report,null,2)+'\n');if(browser)await browser.close();if(server)await new Promise(done=>server.close(done));});
