/* Native-browser checks for focused graph classes, the complete problem graph, and movable canvases. */
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT||'playwright');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {createServer}=require('node:http');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'../dist'),output=resolve(__dirname,'../qa');
const report={checked:new Date().toISOString(),checks:[],contexts:[],accessibility:[],errors:[]};
let browser,server,page;
const check=async(name,run)=>{await run();report.checks.push(name);console.log('PASS',name);};
const ready=()=>page.evaluate(()=>AtlasMath.render());
const camera=id=>page.locator('#'+id).evaluate(e=>({scale:Number(e.dataset.scale),x:Number(e.dataset.panX),y:Number(e.dataset.panY)}));
const action=(id,name)=>page.locator('#'+id+' [data-network-action="'+name+'"]');
const viewport=id=>page.locator('#'+id+' .network-viewport');
async function capture(id,name){
  const value=await page.locator('#'+id).evaluate(e=>{
    const viewport=e.querySelector('.network-viewport'),a=e.getBoundingClientRect(),b=viewport.getBoundingClientRect();
    return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,rootWidth:a.width,viewportWidth:b.width,viewportHeight:b.height,rootOverflow:e.scrollWidth>e.clientWidth+2,viewportOverflow:viewport.scrollWidth>viewport.clientWidth+2,scale:Number(e.dataset.scale),panX:Number(e.dataset.panX),panY:Number(e.dataset.panY),mathErrors:document.querySelectorAll('[data-math-error]').length};
  });
  report.contexts.push({network:id,name,...value});
  assert.ok(value.pageWidth<=value.width+1,name+': page fits');assert.equal(value.rootOverflow,false,name+': controls fit');assert.equal(value.viewportOverflow,false,name+': canvas remains inside the window');assert.ok(value.viewportWidth>0&&value.viewportHeight>0);assert.ok(Number.isFinite(value.scale)&&value.scale>0&&Number.isFinite(value.panX)&&Number.isFinite(value.panY));assert.equal(value.mathErrors,0);
}
async function audit(name){
  if(!process.env.ATLAS_AXE)return;
  if(!await page.evaluate(()=>!!window.axe))await page.addScriptTag({path:process.env.ATLAS_AXE});
  const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));
  const violations=result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));report.accessibility.push({name,violations});assert.deepEqual(violations,[]);
}
async function headingContrast(mode){
  const colors=await page.locator('#class-network .network-column-headings').evaluate(group=>({background:getComputedStyle(group.querySelector('rect')).fill,text:getComputedStyle(group.querySelector('text')).fill}));
  const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(value=>{const s=Number(value)/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  const a=luminance(colors.background),b=luminance(colors.text),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);report.headingColors??=[];report.headingColors.push({mode,...colors,contrast:ratio});assert.ok(ratio>=4.5,mode+' column headings have readable normal-text contrast');
  if(mode==='print')assert.equal(colors.background,'rgb(255, 255, 255)','printed column headings use the white print surface');
}
async function drag(id,from,dx,dy){
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+dx,from.y+dy,{steps:8});await page.mouse.up();
}
function reach(edges,from,to){const queue=[from],seen=new Set([from]);while(queue.length){const id=queue.shift();if(id===to)return true;for(const edge of edges)if(edge.subset===id&&!seen.has(edge.superset)){seen.add(edge.superset);queue.push(edge.superset);}}return false;}
function expectedGraph(spec,focusLabel){
  if(spec.id!=='class-network')return {nodes:spec.data.nodes.map(n=>n.id).sort(),edges:spec.data.edges.map(e=>({source:e[spec.source],target:e[spec.target],transitive:false}))};
  const focus=spec.data.nodes.find(n=>n.label===focusLabel);assert.ok(focus,focusLabel);
  const nodes=spec.data.nodes.filter(n=>reach(spec.data.edges,n.id,focus.id)||reach(spec.data.edges,focus.id,n.id));
  return {nodes:nodes.map(n=>n.id).sort(),edges:nodes.filter(n=>n.id!==focus.id).map(n=>{const source=reach(spec.data.edges,n.id,focus.id)?n.id:focus.id,target=source===focus.id?n.id:focus.id;return {source,target,transitive:!spec.data.edges.some(e=>e.subset===source&&e.superset===target)};})};
}
async function verifyTopology(spec){
  const expected=expectedGraph(spec,await page.locator(spec.focus).inputValue());
  const actual=await page.locator('#'+spec.id).evaluate(e=>({nodes:[...e.querySelectorAll('.network-node')].map(n=>n.dataset.nodeId).sort(),edges:[...e.querySelectorAll('.network-edge')].map(p=>({source:p.dataset.source,target:p.dataset.target,transitive:p.classList.contains('transitive')})),titles:[...e.querySelectorAll('.network-column-title')].map(e=>e.textContent)}));
  const order=(a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b));assert.deepEqual(actual.nodes,expected.nodes);assert.deepEqual(actual.edges.sort(order),expected.edges.sort(order));
  if(spec.id==='class-network')assert.deepEqual(actual.titles,['Contained classes','Selected class','Containing classes']);
  const overflow=await page.locator('#'+spec.id+' .network-node').evaluateAll(nodes=>nodes.flatMap(node=>{const box=node.querySelector('rect').getBoundingClientRect(),label=node.querySelector('.network-node-label-content').getBoundingClientRect();return label.left<box.left-1||label.top<box.top-1||label.right>box.right+1||label.bottom>box.bottom+1?[{id:node.dataset.nodeId,label:node.closest('a').getAttribute('aria-label')}]:[];}));assert.deepEqual(overflow,[],'rich labels stay inside their node boxes');
  assert.equal(await page.locator('#'+spec.id+' .network-node.selected').count(),1);return expected;
}
(async()=>{
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
  server=createServer((req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/atlas\//,'').replace(/^\//,'')||'index.html';const file=resolve(root,relative.endsWith('/')?relative+'index.html':relative);if(!file.startsWith(root+'/'))return res.writeHead(403).end();res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'}).end(readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin='http://127.0.0.1:'+server.address().port,base=origin+'/atlas/';
  browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.ATLAS_BROWSER?{executablePath:process.env.ATLAS_BROWSER}:{})});report.browser=await browser.version();
  const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce',hasTouch:true});
  await context.route('**/*',route=>{if(route.request().url().startsWith(origin)||route.request().url().startsWith('file:'))return route.continue();report.errors.push('External runtime request: '+route.request().url());return route.abort();});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  report.sourceHash=createHash('sha256').update(readFileSync(resolve(root,'app.js'))).update(readFileSync(resolve(root,'style.css'))).update(readFileSync(resolve(root,'network-layout.js'))).update(readFileSync(resolve(root,'network.js'))).digest('hex');
  mkdirSync(output,{recursive:true});
  await page.goto(base+'#explorer',{waitUntil:'networkidle'});await ready();const data=await page.evaluate(()=>ATLAS_DATA);
  const specs=[{id:'class-network',data:data.graphNetwork,source:'subset',target:'superset',focus:'#class-focus',attr:'data-class-focus',pick:'Outerplanar'},{id:'problem-network',data:data.problemNetwork,source:'special',target:'general',focus:'#problem-focus',attr:'data-problem-focus',pick:'Set cover'}];
  await check('The class diagram focuses related classes with solid/dashed inclusions; the problem graph keeps every recorded node and edge',async()=>{
    for(const spec of specs){
      const id=spec.id;
      await verifyTopology(spec);await capture(id,id==='class-network'?'initial focused classes':'initial full problem graph');
    }
    assert.ok(await page.locator('#problem-network .problem-edge.certified').count());assert.ok(await page.locator('#problem-network .problem-edge.structural').count());assert.ok(await page.locator('#problem-network .problem-edge.relaxation').count());
    assert.equal(await page.locator('#class-network ['+specs[0].attr+'="Bounded degree"]').count(),0,'unrelated classes are omitted from the focused view');
    const labels=await page.locator('#class-network .network-node').evaluateAll(nodes=>{const readable=node=>node.nodeType===3?node.nodeValue:node.dataset?.mathReady?node.getAttribute('aria-label'):[...node.childNodes].map(readable).join('');return nodes.map(n=>({id:n.dataset.nodeId,label:readable(n.querySelector('.network-node-label-content'))}));});for(const node of labels)assert.equal(node.label,data.graphNetwork.nodes.find(n=>n.id===node.id).label,'full canonical label '+node.id);
    await headingContrast('screen');
    await viewport('class-network').scrollIntoViewIfNeeded();await page.locator('#class-network').screenshot({path:resolve(output,'class-network-focused-initial.png')});
  });
  await check('Dragging background or a node pans the canvas, suppresses only the drag click, and preserves node selection',async()=>{
    for(const spec of specs){
      const id=spec.id;await viewport(id).scrollIntoViewIfNeeded();
      const box=await viewport(id).boundingBox(),before=await camera(id),focusBefore=await page.locator(spec.focus).inputValue();
      await drag(id,{x:box.x+15,y:box.y+15},85,55);const after=await camera(id);
      assert.ok(Math.abs(after.x-before.x)>40&&Math.abs(after.y-before.y)>20);assert.equal(await page.locator(spec.focus).inputValue(),focusBefore);
      await action(id,'fit').click();
      const link=page.locator('#'+id+' ['+spec.attr+'="'+spec.pick+'"]');await link.focus();
      const node=await link.boundingBox(),dragBefore=await camera(id);
      await drag(id,{x:node.x+node.width/2,y:node.y+node.height/2},30,22);
      const dragAfter=await camera(id);assert.ok(Math.abs(dragAfter.x-dragBefore.x)>10);assert.equal(await page.locator(spec.focus).inputValue(),focusBefore,'drag does not activate the node');
      await link.focus();await link.click();assert.equal(await page.locator(spec.focus).inputValue(),spec.pick,'the next normal click still works');
      await verifyTopology(spec);await capture(id,'after background and node drag');
    }
  });
  await check('Camera controls, wheel panning, Shift-wheel and Ctrl-wheel work inside graphs while outside scrolling stays on the page',async()=>{
    for(const spec of specs){
      const id=spec.id;await viewport(id).scrollIntoViewIfNeeded();await action(id,'fit').click();const fit=await camera(id);
      await action(id,'zoom-in').click();assert.ok((await camera(id)).scale>fit.scale);await action(id,'zoom-out').click();assert.ok(Math.abs((await camera(id)).scale-fit.scale)<0.01);
      await action(id,'center').click();const centered=await camera(id);assert.ok(centered.scale>0);
      const keyboard=page.locator('#'+id);await keyboard.focus();await keyboard.press('ArrowRight');assert.notEqual((await camera(id)).x,centered.x);
      const moved=await camera(id);await keyboard.press('ArrowDown');assert.notEqual((await camera(id)).y,moved.y);
      const keyZoom=await camera(id);await keyboard.press('Shift+Equal');assert.ok((await camera(id)).scale>keyZoom.scale);await keyboard.press('0');assert.ok(Math.abs((await camera(id)).scale-fit.scale)<0.01);
      const box=await viewport(id).boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      const plainBefore=await camera(id),pageBefore=await page.evaluate(()=>scrollY);await page.mouse.wheel(45,90);await page.waitForTimeout(100);const plainAfter=await camera(id);assert.ok(Math.abs(plainAfter.x-plainBefore.x+45)<1);assert.ok(Math.abs(plainAfter.y-plainBefore.y+90)<1);assert.equal(plainAfter.scale,plainBefore.scale);assert.equal(await page.evaluate(()=>scrollY),pageBefore,'wheel inside the graph does not scroll the document');
      await page.keyboard.down('Shift');await page.mouse.wheel(0,80);await page.keyboard.up('Shift');await page.waitForTimeout(100);const shiftAfter=await camera(id);assert.ok(Math.abs(shiftAfter.x-plainAfter.x+80)<1);assert.equal(shiftAfter.y,plainAfter.y);assert.equal(shiftAfter.scale,plainAfter.scale,'Shift-wheel pans horizontally without zooming');
      const wheelBefore=await camera(id);await page.keyboard.down('Control');await page.mouse.wheel(0,-160);await page.keyboard.up('Control');await page.waitForTimeout(100);assert.ok((await camera(id)).scale>wheelBefore.scale);
      const outsideBefore=await camera(id),scrollBefore=await page.evaluate(()=>scrollY);await page.mouse.move(5,100);await page.mouse.wheel(0,scrollBefore>200?-120:120);await page.waitForTimeout(100);assert.ok(Math.abs((await page.evaluate(()=>scrollY))-scrollBefore)>20,'wheel outside the graph scrolls the document');assert.deepEqual(await camera(id),outsideBefore,'outside scrolling leaves the graph camera unchanged');
      await action(id,'fit').click();await capture(id,'zoom and keyboard');
    }
  });
  await check('Fit contains all nodes after resizing, focus reveals keyboard targets, and touch dragging pans on mobile',async()=>{
    for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:1100});
      for(const spec of specs){
        const id=spec.id;await viewport(id).scrollIntoViewIfNeeded();await action(id,'fit').click();
        const outside=await viewport(id).evaluate(e=>{const b=e.getBoundingClientRect();return [...e.querySelectorAll('.network-node rect')].filter(n=>{const a=n.getBoundingClientRect();return a.left<b.left-2||a.right>b.right+2||a.top<b.top-2||a.bottom>b.bottom+2;}).map(n=>n.parentNode.dataset.nodeId);});assert.deepEqual(outside,[],id+' fits all nodes at '+width);
        const link=page.locator('#'+id+' ['+spec.attr+'="'+spec.pick+'"]');await link.focus();const visible=await link.evaluate(e=>{const a=e.getBoundingClientRect(),b=e.closest('.network-viewport').getBoundingClientRect();return a.left>=b.left-2&&a.right<=b.right+2&&a.top>=b.top-2&&a.bottom<=b.bottom+2;});assert.equal(visible,true,'focused node is visible');
        await capture(id,'responsive '+width);
      }
    }
    const id='class-network';await viewport(id).scrollIntoViewIfNeeded();const box=await viewport(id).boundingBox(),before=await camera(id),cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+15,y:box.y+15}]});
    for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+15+i*12,y:box.y+15+i*9}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();assert.notEqual((await camera(id)).x,before.x);assert.equal(await viewport(id).evaluate(e=>getComputedStyle(e).touchAction),'none');await capture(id,'mobile touch pan');
    await audit('mobile draggable inclusion graphs');
  });
  await check('Typed problem edges follow the selected transfer direction and graph controls preserve drill-down behavior',async()=>{
    await page.setViewportSize({width:1440,height:1100});
    for(const mode of ['upper','lower']){
      await page.locator('#explorer-bound').selectOption(mode);await ready();
      const actual=await page.locator('#problem-network .network-edge').evaluateAll(es=>es.map(e=>({source:e.dataset.source,target:e.dataset.target,kind:e.classList.contains('reduction')?'reduction':e.classList.contains('relaxation')?'relaxation':e.classList.contains('certified')?'certified':'structural'})));
      const expected=data.problemNetwork.edges.map(e=>({source:e.special,target:e.general,kind:e.kind==='approximation-reduction'?'reduction':e.kind==='relaxation'?'relaxation':e[mode]?'certified':'structural'}));assert.deepEqual(actual.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),expected.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
    }
    await page.locator('#class-focus').selectOption('Planar',{force:true});const expected=Number((await page.locator('#class-results').textContent()).match(/\d+/)[0]);await page.locator('#class-results').click();assert.equal(await page.locator('.result-row').count(),expected);
    await page.locator('[data-view="explorer"]').click();await ready();await audit('desktop draggable inclusion graphs');
  });
  await check('Both camera positions and zoom levels survive leaving and returning to the Explorer',async()=>{
    for(const spec of specs){await action(spec.id,'center').click();await action(spec.id,'zoom-in').click();await page.locator('#'+spec.id).focus();await page.locator('#'+spec.id).press('ArrowLeft');}
    const before=await Promise.all(specs.map(spec=>camera(spec.id)));
    await page.locator('[data-view="catalog"]').click();await page.locator('[data-view="explorer"]').click();await ready();await page.waitForTimeout(100);
    for(let i=0;i<specs.length;i++){const after=await camera(specs[i].id);for(const key of ['scale','x','y'])assert.ok(Math.abs(after[key]-before[i][key])<1,'camera '+key+' persists for '+specs[i].id);}
  });
  await check('Focused class selection retains the parameterized K2t inclusion and certified SOTA drill-down',async()=>{
    await page.locator('#explorer-bound').selectOption('upper');await page.locator('#class-focus').selectOption('K₂,t-minor-free',{force:true});await ready();await verifyTopology(specs[0]);
    assert.equal(await page.locator('#class-network [data-class-focus="H-minor-free; pw(H) ≤ 2"]').count(),1);
    const relation=page.locator('#class-network .network-edge[data-source="k2t"][data-target="minor-pw2"]');assert.equal(await relation.count(),1);assert.equal(await relation.evaluate(e=>e.classList.contains('transitive')),false);
    await page.locator('#class-results').click();await page.locator('[data-problem="Dominating set"]').click();await page.locator('#sota-only').check();await ready();
    const inherited=page.locator('.problem-button[data-result="pic-thesis-pw2-dom"]').locator('xpath=ancestor::tr');assert.equal(await inherited.count(),1);assert.equal(await inherited.locator('.result-setting [data-condition="binding-excluded-minor-k2t"]').count(),1);assert.equal(await inherited.locator('.round-bound [data-math-ready][aria-label]').first().getAttribute('aria-label'),'O(t)');assert.equal(await page.locator('.problem-button[data-result="pic-large-50-dom"]').count(),0);
    await page.locator('[data-view="explorer"]').click();await page.locator('#class-focus').selectOption('Planar',{force:true});await ready();
  });
  mkdirSync(output,{recursive:true});
  for(const spec of specs){await viewport(spec.id).scrollIntoViewIfNeeded();await action(spec.id,'fit').click();await page.locator('#'+spec.id).screenshot({path:resolve(output,spec.id+'-graph.png')});}
  await check('Print shows the whole recorded graph and screen mode restores the movable camera',async()=>{
    await page.emulateMedia({media:'print'});
    await headingContrast('print');
    for(const spec of specs){
      const id=spec.id;await page.waitForFunction(id=>document.querySelector('#'+id+' .network-camera').getAttribute('transform')==='',id);
      assert.equal(await action(id,'fit').isVisible(),false,'camera toolbar is omitted from print');
      const size=await page.locator('#'+id).evaluate((e,spec)=>{const box=e.querySelector('svg').viewBox.baseVal,focus=e.querySelector('.network-node.selected').dataset.nodeId,layout=spec.focused?AtlasNetworkLayout.focused(spec.nodes,spec.edges,focus):AtlasNetworkLayout.layout(spec.nodes,spec.edges);return {actual:[box.x,box.y,box.width,box.height],expected:[0,0,layout.width,layout.height]};},{nodes:spec.data.nodes,edges:spec.data.edges.map(edge=>({...edge,source:edge[spec.source],target:edge[spec.target]})),focused:id==='class-network'});assert.deepEqual(size.actual,size.expected,id+' print viewBox covers the entire displayed layout');
      const outside=await viewport(id).evaluate(e=>{const svg=e.querySelector('svg'),b=svg.getBoundingClientRect();return [...e.querySelectorAll('.network-node rect')].filter(n=>{const a=n.getBoundingClientRect();return a.left<b.left-2||a.right>b.right+2||a.top<b.top-2||a.bottom>b.bottom+2;}).map(n=>n.parentNode.dataset.nodeId);});assert.deepEqual(outside,[],id+' prints all nodes');
    }
    await page.emulateMedia({media:'screen'});
    for(const spec of specs){await page.waitForFunction(id=>document.querySelector('#'+id+' .network-camera').getAttribute('transform').includes('scale('),spec.id);await capture(spec.id,'screen restored after print');}
  });
  await page.goto(pathToFileURL(resolve(root,'index.html')).href+'#explorer',{waitUntil:'load'});await ready();
  for(const spec of specs){await verifyTopology(spec);await action(spec.id,'zoom-in').click();assert.ok((await camera(spec.id)).scale>0);}
  report.checks.push('Both draggable graphs work from a direct file URL with local assets only');assert.deepEqual(report.errors,[]);
  console.log('Network QA complete:',report.checks.length,'groups;',report.contexts.length,'layout contexts;',report.accessibility.length,'accessibility audits.');
})().catch(error=>{report.failure=error.message;console.error(error);process.exitCode=1;}).finally(async()=>{mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'network-browser-report.json'),JSON.stringify(report,null,2)+'\n');if(browser)await browser.close();if(server)await new Promise(done=>server.close(done));});
