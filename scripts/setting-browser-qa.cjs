/* Optional focused native-browser regression for condition scopes and ratio filtering. */
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT||'playwright');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {createServer}=require('node:http');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'../dist'),output=resolve(__dirname,'../qa');
const checks=[],contexts=[],errors=[];let browser,server;
(async()=>{
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
  server=createServer((req,res)=>{
    try{
      const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/atlas\//,'')||'index.html';
      const file=resolve(root,name.endsWith('/')?name+'index.html':name);
      if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}
      res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(readFileSync(file));
    }catch{res.writeHead(404).end();}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin='http://127.0.0.1:'+server.address().port,base=origin+'/atlas/';
  browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.ATLAS_BROWSER?{executablePath:process.env.ATLAS_BROWSER}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const ready=()=>page.evaluate(()=>AtlasMath.render());
  const view=async(params={})=>{const query=Object.fromEntries(Object.entries(params).map(([key,value])=>[key,typeof value==='boolean'?(value?'1':'0'):value]));await page.goto(base+'#catalog?'+new URLSearchParams(query),{waitUntil:'networkidle'});await ready();};
  const row=id=>page.locator('.problem-button[data-result="'+id+'"]').locator('xpath=ancestor::tr');
  const ids=()=>page.locator('.result-row .problem-button').evaluateAll(es=>es.map(e=>e.dataset.result));
  const open=async id=>{await row(id).locator('.problem-button').click();await ready();};
  const close=()=>page.locator('#dialog-close').click();
  const contains=async name=>{
    const state=await page.evaluate(()=>{
      const area=document.querySelector('dialog[open] #dialog-content')||document.querySelector('.view:not([hidden])');
      return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,overflow:[...area.querySelectorAll('td,th,.metric,.detail-definition dd')].filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className,text:e.textContent.slice(0,80)})),mathErrors:document.querySelectorAll('[data-math-error]').length};
    });
    contexts.push({name,...state});assert.ok(state.pageWidth<=state.width+1);assert.deepEqual(state.overflow,[]);assert.equal(state.mathErrors,0);
  };
  await view();const data=await page.evaluate(()=>ATLAS_DATA);
  const globalIds=data.results.filter(r=>r.constantApproximation).map(r=>r.id).sort();assert.equal(globalIds.length,33);
  await page.locator('#constant-ratio-only').check();await ready();
  assert.deepEqual((await ids()).sort(),globalIds);
  assert.ok((await ids()).includes('pic-large-50-dom'));assert.ok((await ids()).includes('pic-thesis-genus-616'));
  assert.ok(!(await ids()).includes('gen-asw26-minordensity'));
  assert.match(page.url(),/constantRatio=1/);
  await page.reload();await ready();assert.equal(await page.locator('#constant-ratio-only').isChecked(),true);
  await page.locator('#constant-ratio-only').uncheck();assert.equal(await page.locator('#constant-ratio-only').isChecked(),false);
  assert.equal((await ids()).length,data.results.length);
  checks.push('Constant-ratio filter is independent of runtime parameters, persists in URLs, and clears through its toggle');

  await view({problem:'MDS',graph:'Planar',sota:true,constantRatio:true});
  const minor=row('gen-asw26-minordensity');assert.equal(await minor.count(),1);
  assert.equal(await minor.locator('.approx-cell > .math').getAttribute('aria-label'),'7');
  assert.equal(await minor.locator('.benchmark-marker').count(),1);
  assert.equal(await minor.locator('.result-setting [data-condition="binding-a-three"]').count(),1);
  assert.equal(await minor.locator('.certificate-qualifiers [data-condition="binding-a-three"]').count(),0);
  const downloadEvent=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadEvent;
  const csvPath=resolve('/tmp','atlas-setting-filter.csv');await download.saveAs(csvPath);const csv=readFileSync(csvPath,'utf8');
  assert.match(csv,/queryApproximationDisplay/);assert.match(csv,/queryConstantApproximation/);assert.match(csv,/querySetting/);
  const parsed=await page.evaluate(csv=>{
    csv=csv.replace(/^\uFEFF/,'');
    const records=[];let row=[],cell='',quoted=false;
    for(let i=0;i<csv.length;i++){const ch=csv[i];if(ch==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell='';}else if(ch==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));records.push(row);row=[];cell='';}else cell+=ch;}
    if(cell||row.length){row.push(cell);records.push(row);}const fields=records.shift();return records.map(row=>Object.fromEntries(fields.map((f,i)=>[f,row[i]])));
  },csv);
  const exported=parsed.find(r=>r.id==='gen-asw26-minordensity');
  assert.equal(exported.constantApproximation,'false');assert.equal(exported.queryConstantApproximation,'true');assert.equal(exported.queryApproximationDisplay,'7');
  assert.match(exported.querySetting,/a=3/);
  const bibEvent=page.waitForEvent('download');await page.locator('#export-bibtex').click();const bibDownload=await bibEvent;
  const bibPath=resolve('/tmp','atlas-setting-filter.bib');await bibDownload.saveAs(bibPath);assert.match(readFileSync(bibPath,'utf8'),/2611\.02057/);
  checks.push('Planar specialization retains factor seven with SOTA and Constant ratio filters; exports distinguish source and query guarantees');

  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1050});await view();await contains('catalog '+width);
    const regular=row('folklore-regular-vc');
    assert.equal(await regular.locator('.result-setting [data-condition="graph-regular-positive"]').count(),1);
    assert.equal(await regular.locator('.result-setting [data-condition="weights-unweighted"]').count(),1);
    assert.equal(await regular.locator('.certificate-qualifiers').count(),0);
    assert.doesNotMatch(await regular.innerText(),/Select all vertices|Positive regular degree|positive-degree regular/i);
    await open('folklore-regular-vc');
    assert.equal(await page.locator('.setting-section [data-condition="graph-regular-positive"]').count(),1);
    assert.equal(await page.locator('.setting-section [data-condition="weights-unweighted"]').count(),1);
    assert.equal(await page.locator('.dialog-subtitle').count(),0);
    assert.match(await page.locator('.folklore-note').textContent(),/Every vertex selects itself/);
    assert.equal(await page.locator('.original-source-fields').getAttribute('open'),null);
    await contains('regular detail '+width);await close();
    await open('pic-large-50-dom');
    assert.equal(await page.locator('.setting-section [data-condition="parameter-fixed-t-ge2"]').count(),1);
    assert.equal(await page.locator('.dialog-eyebrow [data-condition="claim-t-ge49"]').count(),0,'the covered instance has no active SOTA qualifier');
    assert.equal(await page.locator('.setting-section [data-condition="claim-t-ge49"]').count(),0);
    assert.equal(await page.locator('.sota-note [data-condition="claim-t-ge49"]').count(),0);
    assert.match(await page.locator('.dominance-note h3').textContent(),/Covered by the broader theorem/);
    await contains('covered factor50 detail '+width);await close();
    await open('gen-asw26-minordensity');
    assert.equal(await page.locator('.dialog-eyebrow [data-condition="parameter-a-integer-ge2"]').count(),1);
    assert.equal(await page.locator('.dialog-eyebrow [data-condition="parameter-a-integer-ge1"]').count(),1);
    await contains('minor density detail '+width);await close();
    await open('pic-girth-pruning');
    for(const id of ['parameter-k-ge2','parameter-expansion-ge1'])assert.equal(await page.locator('.dialog-eyebrow [data-condition="'+id+'"]').count(),1);
    await contains('girth detail '+width);await close();
    for(const id of ['gen-ffk21-vc-bip','gen-hs22-mwm']){
      await open(id);
      const source=data.results.find(r=>r.id===id);
      for(const condition of source.sota.conditionIds)assert.equal(await page.locator('.dialog-eyebrow [data-condition="'+condition+'"]').count(),1);
      await contains(id+' claim qualifiers '+width);await close();
    }
    for(const id of ['gen-fk25-arboricity-fast','pic-girth-sublinear','gen-beks18-exact2']){
      await open(id);
      const source=data.results.find(r=>r.id===id);
      for(const condition of source.setting.detail)assert.equal(await page.locator('.setting-section [data-condition="'+condition+'"]').count(),1);
      await contains(id+' further details '+width);await close();
    }
  }
  checks.push('Canonical settings, constructions and additional certificate restrictions appear once on desktop and mobile');

  await page.setViewportSize({width:1440,height:1050});await view();
  for(const id of ['folklore-regular-vc','pic-large-50-dom'])await page.locator('[data-select="'+id+'"]').check();
  await page.locator('#compare-open').click();await ready();
  assert.equal(await page.locator('.compare-table [data-condition="graph-regular-positive"]').count(),1);
  assert.equal(await page.locator('.compare-table [data-condition="claim-t-ge49"]').count(),0,'covered source instances do not repeat historical SOTA qualifiers');
  assert.match(await page.locator('.compare-table').textContent(),/Covered by /);
  assert.equal(await page.locator('.compare-table [data-condition="strength-no-ids"]').count(),1);
  await contains('comparison');await close();checks.push('Comparison uses the same shared setting and preserves further details');

  await view({constantRatio:true});await page.locator('#sota-only').check();await ready();
  assert.ok((await ids()).length>0);for(const id of await ids())assert.ok(globalIds.includes(id));
  await page.locator('a[href="#explorer"]').click();await ready();
  await page.goBack();await ready();assert.equal(await page.locator('#constant-ratio-only').isChecked(),true);assert.equal(await page.locator('#sota-only').isChecked(),true);
  await page.locator('#reset').click();assert.equal(await page.locator('#constant-ratio-only').isChecked(),false);assert.equal(await page.locator('#sota-only').isChecked(),false);
  checks.push('SOTA and Constant ratio combine independently and browser history restores both');

  await view({problem:'Vertex cover',q:'folklore regular'});await open('folklore-regular-vc');
  mkdirSync(output,{recursive:true});await page.locator('#detail-dialog').screenshot({path:resolve(output,'canonical-setting.png')});
  assert.deepEqual(errors,[]);
  writeFileSync(resolve(output,'canonical-setting-report.json'),JSON.stringify({checked:new Date().toISOString(),browser:await browser.version(),globalConstantRatios:globalIds.length,checks,contexts,errors},null,2)+'\n');
  console.log('PASS',checks.length,'focused browser groups;',contexts.length,'layout contexts');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(done=>server.close(done));});
