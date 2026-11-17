(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = value => { try {const u = new URL(value);return u.protocol === 'https:' ? esc(u.href) : '#';} catch {return '#';} };
  if (!window.ATLAS_DATA || !window.AtlasCore) {
    $('#result-count').textContent = 'The catalog could not be loaded. Please reload the page, or use the dataset link below.';
    return;
  }
  const {results, papers, updated} = window.ATLAS_DATA;
  const core = window.AtlasCore;
  const math = window.AtlasMath?.html || esc;
  const typeset = root => {
    const rendered=window.AtlasMath?.render(root);
    rendered?.then(queueViewportFit);
    return rendered;
  };
  const bibtex = core.bibtex;
  const paperMap = Object.fromEntries(papers.map(p => [p.id,p]));
  const resultMap = Object.fromEntries(results.map(r => [r.id,r]));
  const selected = new Set();
  const defaults = {view:'catalog',q:'',problem:'',paper:'',model:'',graph:'',randomization:'',bound:'',round:'',sort:'rounds',transfer:false,sota:false,tight:false,constantRatio:false,bibq:'',explorerBound:'upper',classTransfer:true,classFocus:'Planar',problemTransfer:true,problemFocus:'Dominating set',reductionProblem:'',reductionModel:'',reductionKind:'',reductionQ:'',reduction:'',reductionBound:'upper'};
  const views = ['catalog','explorer','reductions','bibliography','about'];
  const roundSymbols = {constant:'Constant',parameter:'Parameter-dependent',logstar:'O(log* n)',degree:'Degree-dependent',logarithmic:'O(log n)',polylog:'polylog n',other:'Other'};
  let state = {...defaults};
  let visible = [];
  let toastTimer;
  let activeResult = '';
  let dialogOpener = null;
  let viewportFitQueued = false;
  let rowSettingKey = '';
  const rowCache = new Map();

  function revealCurrentNavigation() {
    const nav=$('.primary-nav'),current=nav.querySelector('[aria-current="page"]');
    if(!current)return;
    const frame=nav.getBoundingClientRect(),tab=current.getBoundingClientRect();
    if(tab.left<frame.left)nav.scrollLeft-=frame.left-tab.left;
    else if(tab.right>frame.right)nav.scrollLeft+=tab.right-frame.right;
  }

  function fitResultsViewport() {
    const frame=$('#result-scroll');
    if(state.view!=='catalog'||frame.hidden)return;
    const available=window.innerHeight-Math.max(0,frame.getBoundingClientRect().top)-12;
    frame.style.setProperty('--results-viewport-height',Math.max(240,available)+'px');
  }
  function queueViewportFit() {
    if(viewportFitQueued)return;
    viewportFitQueued=true;
    const update=()=>{viewportFitQueued=false;if(!window.document?.getElementById('main'))return;revealCurrentNavigation();fitResultsViewport();};
    if(window.requestAnimationFrame)window.requestAnimationFrame(update);
    else update();
  }

  function readLocation() {
    const [view, query = ''] = location.hash.slice(1).split('?');
    const params = new URLSearchParams(query);
    state = {...defaults,view:views.includes(view)?view:'catalog'};
    for (const key of Object.keys(defaults)) if (key !== 'view' && params.has(key)) state[key] = typeof defaults[key] === 'boolean' ? params.get(key) === '1' : params.get(key);
    if (state.round && !core.roundOrder.includes(state.round)) state.round = '';
    if (!['rounds','newest','oldest','problem'].includes(state.sort)) state.sort='rounds';
    for(const key of ['graph','classFocus'])if(core.resolveClass(state[key]))state[key]=core.resolveClass(state[key]).label;
    for(const key of ['problem','problemFocus'])if(core.resolveProblem(state[key]))state[key]=core.resolveProblem(state[key]).label;
    if(core.resolveProblem(state.reductionProblem))state.reductionProblem=core.resolveProblem(state.reductionProblem).id;
    const options={problem:core.problemNodes.map(n=>n.label),problemFocus:core.problemNodes.map(n=>n.label),paper:Object.keys(paperMap),model:['LOCAL','CONGEST','Anonymous','SUPPORTED'],graph:core.graphNodes.map(n=>n.label),classFocus:core.graphNodes.map(n=>n.label),randomization:['Deterministic','Randomized','Unspecified'],bound:['upper','lower'],explorerBound:['upper','lower'],reductionBound:['upper','lower'],reductionModel:['LOCAL','CONGEST','Anonymous','SUPPORTED'],reductionKind:['automatic','conditional','relaxation'],reductionProblem:core.problemNodes.map(n=>n.id)};
    for(const [key,values] of Object.entries(options)) if(state[key] && !values.includes(state[key])) state[key]=defaults[key];
    if(state.reduction&&!core.reductions.some(r=>r.id===state.reduction))state.reduction='';
    activeResult = resultMap[params.get('result')] ? params.get('result') : '';
    if(params.get('result')&&!activeResult)notify('This result link is unavailable. Showing the reference instead.');
  }
  function viewUrl(resultId = '') {
    const params = new URLSearchParams();
    for (const [key,value] of Object.entries(state)) if (key !== 'view' && value !== defaults[key]) params.set(key,typeof value==='boolean'?(value?'1':'0'):value);
    if (resultId) params.set('result',resultId);
    const query=params.toString();
    return '#'+state.view+(query?'?'+query:'');
  }
  function writeLocation(mode='replace') {
    const hash=viewUrl(activeResult);
    if(location.hash===hash)return;
    try {history[mode+'State'](null,'',hash);}
    catch {location.hash=hash;}
  }
  function setView(view) {
    state.view=view;activeResult='';writeLocation('push');
    if($('#detail-dialog').open)$('#detail-dialog').close();
    render();
    $('#main').focus({preventScroll:true});
    // Start the new view with its header visible; deep links scroll to their own targets.
    window.scrollTo({top:0,left:0,behavior:'instant'});
  }
  function updateFilter(key,value) {state[key]=value;activeResult='';writeLocation();render();}
  function reset() {state={...defaults,bibq:state.bibq,explorerBound:state.explorerBound};$('#search').value='';writeLocation();render();}
  function notify(message) {($('#detail-dialog').open?$('#detail-dialog'):document.body).append($('#toast'));clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3200);}
  async function copy(text,message='Copied to clipboard',filename='atlas-link.txt') {
    try {await navigator.clipboard.writeText(text);notify(message);}
    catch {download(filename,text,'text/plain;charset=utf-8');notify('Clipboard unavailable. Downloaded a text file instead.');}
  }
  function download(name,content,type) {
    const url = URL.createObjectURL(new Blob([content],{type}));
    const a = document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function paperShort(p) {
    const names = p.authors.split(/;|\s+and\s+/).map(x=>x.trim()).filter(Boolean);
    const surname = names[0]?.split(' ').at(-1) || p.id;
    return (names.length>1?surname+' et al.':surname)+' · '+p.year+(p.type==='phdthesis'?' · thesis':'');
  }
  function isPreprint(p) {return /arxiv|corr|preprint/i.test(p.venue);}
  function parameterDefinitions(r) {
    const base=r.parameterDefinitions||[...(r.roundParameters||[]),...(r.approximationParameters||[])].map(p=>({symbol:p.symbol,description:p.name,tex:window.ATLAS_DATA.notation[p.symbol]||p.symbol}));
    const extra=r.id?core.effectiveRounds(r,resultContext()).parameterDefinitions:[];
    return [...new Map([...base,...extra].map(p=>[p.symbol,p])).values()];
  }
  function resultMath(r,value,className='math',tex) {return math(value,className,tex,parameterDefinitions(r));}
  function parameterToken(r,parameter) {
    const known=parameterDefinitions(r).find(p=>p.symbol===parameter.symbol)||parameter;
    const description=known.description||known.name||parameter.name;
    return '<span class="parameter-token" role="term" tabindex="0" data-parameter="'+esc(parameter.symbol)+'" data-parameter-description="'+esc(description)+'" aria-label="'+esc(parameter.symbol+': '+description)+'">'+math(parameter.symbol,'parameter-symbol',known.tex||window.ATLAS_DATA.notation[parameter.symbol]||parameter.symbol)+'</span>';
  }
  function parameterMatches(r,text) {
    const aliases=new Map();
    for(const p of parameterDefinitions(r)){
      const symbol=/^[A-Za-z]\(/.test(p.symbol)?p.symbol[0]:p.symbol;
      if(!aliases.has(symbol))aliases.set(symbol,p);
      const subscript={t:'ₜ',k:'ₖ',h:'ₕ'}[symbol];if(subscript&&!aliases.has(subscript))aliases.set(subscript,p);
    }
    if(!aliases.size)return [];
    const pattern=[...aliases.keys()].sort((a,b)=>b.length-a.length).map(value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
    const regexp=new RegExp('(?<![A-Za-z0-9])(?:'+pattern+')(?![A-Za-z0-9])','g');
    return [...String(text||'').matchAll(regexp)].map(match=>({start:match.index,end:match.index+match[0].length,text:match[0],definition:aliases.get(match[0])}));
  }
  function parameterText(r,text,interactive=true) {
    if(window.AtlasMath?.hasText(text))return graphText(text,r,interactive);
    const value=String(text||''),matches=parameterMatches(r,value);let offset=0,output='';
    for(const match of matches){const p=match.definition;output+=esc(value.slice(offset,match.start))+'<span class="parameter-inline"'+(interactive?' role="term" tabindex="0"':'')+' data-parameter="'+esc(p.symbol)+'" data-parameter-description="'+esc(p.description)+'"'+(interactive?' aria-label="'+esc(p.symbol+': '+p.description)+'"':'')+'>'+esc(match.text)+'</span>';offset=match.end;}
    return output+esc(value.slice(offset));
  }
  function graphText(value,r=null,interactive=true) {
    return window.AtlasMath?.text(value,r?parameterDefinitions(r):[],interactive)??esc(value);
  }
  function graphPath(nodes) {
    return nodes.map(id=>graphText(core.resolveClass(id).label,null,false)).join(' '+math('⊆','math graph-math','\\subseteq')+' ');
  }
  function parameterContextAttrs(r,text) {
    const meanings=[...new Map(parameterMatches(r,text).map(m=>[m.definition.symbol,m.definition])).values()].map(p=>p.symbol+' — '+p.description).join('; ');
    return meanings?' data-parameter-summary="'+esc(meanings)+'" aria-description="'+esc(meanings)+'"':'';
  }
  function functionBound(r,parameters,label,className) {
    const head=label.match(/^([fF])\(/)?.[1]||'f';
    const fn={symbol:head,description:'An unspecified function of the listed fixed parameters',tex:head};
    const names=parameters.map(p=>'<span class="function-argument">'+parameterToken(r,p)+'</span>').join(',<wbr> ');
    return '<span class="'+esc(className)+'" role="group" aria-label="'+esc(label)+'" data-math-ready="true">'+parameterToken({parameterDefinitions:[fn]},fn)+math('(','function-mark','(')+names+math(')','function-mark',')')+(className.includes('round-bound')?roundDisplayParts(r,label).caption:'')+'</span>';
  }
  function modelBadge(r) {const icon=['LOCAL','CONGEST','Anonymous','SUPPORTED'].includes(r.model)?'<img src="assets/model-'+r.model.toLowerCase()+'.svg" width="26" height="26" alt="">':'';return '<span class="model-badge '+r.model.toLowerCase()+'">'+icon+esc(r.model)+'</span>';}
  function folkloreBadge(r){return r.attribution==='folklore'?'<span class="folklore-badge" title="Folklore / elementary baseline; the citation documents the result and does not claim discovery credit.">Folklore</span>':'';}
  function folkloreDetails(r){return r.attribution==='folklore'?'<section class="detail-section folklore-note"><h3>Folklore / elementary baseline</h3><p>'+esc(r.provenanceNote)+'</p>'+(r.derivationNote?'<p class="derivation-note">'+esc(r.derivationNote)+'</p>':'')+'<h4>Construction</h4><p>'+esc(r.algorithm)+'</p><h4>Why the guarantee holds</h4><p>'+esc(r.proofSketch)+'</p>'+resultMath(r,r.proofFormula)+'</section>':'';}
  const resultContext=()=>state.view==='reductions'?{}:state;
  const conditionCatalog=()=>window.ATLAS_DATA.conditions||{};
  const hasSetting=r=>!!(r.setting&&window.ATLAS_DATA.conditions);
  function conditionIds(ids=[]) {return [...new Set(ids)].filter(id=>conditionCatalog()[id]);}
  function conditionClosure(ids=[]) {
    const covered=new Set(),pending=[...ids];
    while(pending.length){const id=pending.pop();if(covered.has(id))continue;covered.add(id);pending.push(...(conditionCatalog()[id]?.implies||[]));}
    return covered;
  }
  function matchedSettingTransfer(r) {return core.matchedScopeTransfer?.(r,resultContext())||core.sotaContext(r,resultContext()).transfer||null;}
  function settingSummaryIds(r) {return conditionIds([...(r.setting?.summary||[]),...(matchedSettingTransfer(r)?.settingConditionIds||[])]);}
  function coveredConditions(r) {
    const setting=r.setting||{};
    return conditionClosure([...Object.values(setting).flat(),...(matchedSettingTransfer(r)?.settingConditionIds||[])]);
  }
  function conditionHtml(ids,className='',r=null) {
    return conditionIds(ids).map(id=>{
      const fact=conditionCatalog()[id];
      const content=fact.parts?fact.parts.map(part=>typeof part==='string'?(r?parameterText(r,part):graphText(part)):(r?resultMath(r,part.math,'condition-math'):math(part.math,'condition-math'))).join(''):(r?parameterText(r,fact.label):graphText(fact.label));
      return '<span class="condition-ref'+(className?' '+className:'')+'" data-condition="'+esc(id)+'">'+content+'</span>';
    }).join('<span class="condition-separator" aria-hidden="true"> · </span>');
  }
  function conditionQualifiers(r,ids,className='',excluded=[]) {
    const covered=coveredConditions(r);for(const id of excluded)covered.add(id);
    const remaining=conditionIds(ids).filter(id=>!covered.has(id));
    return remaining.length?'<span class="certificate-qualifiers'+(className?' '+className:'')+'">'+conditionHtml(remaining,'',r)+'</span>':'';
  }
  function settingGroups(r) {
    const groups={summary:settingSummaryIds(r)},shown=conditionClosure(groups.summary);
    for(const key of ['parameters','assumptions','detail']){
      groups[key]=conditionIds(r.setting?.[key]).filter(id=>!shown.has(id));
      for(const id of conditionClosure(groups[key]))shown.add(id);
    }
    return groups;
  }
  function settingSummary(r) {
    if(hasSetting(r))return conditionHtml(settingSummaryIds(r),'',r);
    return parameterText(r,r.graphClass)+(r.prerequisite?' · '+parameterText(r,r.prerequisite):'')+(r.variant&&r.variant!=='Unweighted'?' · '+parameterText(r,r.variant):'');
  }
  function settingDetails(r) {
    if(!hasSetting(r))return '<section class="detail-section setting-section"><h3>Setting & assumptions</h3><dl class="detail-definition"><dt>Graph class</dt><dd>'+graphText(r.graphClass,r)+'</dd><dt>Fixed parameters</dt><dd>'+esc(r.parameters||'See source.')+'</dd><dt>Additional conditions</dt><dd>'+esc(r.assumptions||'No additional conditions transcribed; consult the source for full theorem details.')+'</dd></dl></section>';
    const groups=settingGroups(r),labels={summary:'Graph & variant',parameters:'Parameters',assumptions:'Assumptions',detail:'Further details'};
    return '<section class="detail-section setting-section"><h3>Setting & assumptions</h3><dl class="detail-definition">'+Object.entries(groups).filter(([,ids])=>ids.length).map(([key,ids])=>'<dt>'+labels[key]+'</dt><dd>'+conditionHtml(ids,'',r)+'</dd>').join('')+'</dl></section>';
  }
  function originalSourceFields(r) {
    if(!hasSetting(r))return '';
    const fields=[['Problem wording',r.problemSource],['Recorded round complexity',r.rounds],['Compact round complexity',r.roundsDisplay],['Graph class',r.graphClassSource||r.graphClass],['Variant',r.variant],['Prerequisite',r.prerequisite],['Parameters',r.parameters],['Assumptions',r.assumptions],['Summary',r.summary],['SOTA setting',r.sota?.setting],['SOTA scope',r.sota?.scopeLabel]];
    for(const transfer of r.sotaScopeTransfers||[])fields.push(['Specialized SOTA setting',transfer.setting],['Specialized SOTA scope',transfer.scopeLabel]);
    const tight=core.tightContext(r,resultContext());
    for(const certificate of tight.sourceCertificates)fields.push(['Tight '+tightAxis[certificate.axis]+' scope',certificate.scopeLabel],['Tight '+tightAxis[certificate.axis]+' parameter domain',certificate.parameterDomain]);
    return '<details class="original-source-fields"><summary>Original source fields</summary><dl class="detail-definition">'+fields.filter(([,value])=>value).map(([label,value])=>'<dt>'+esc(label)+'</dt><dd>'+(label==='Graph class'?graphText(value,r):esc(value))+'</dd>').join('')+'</dl></details>';
  }
  function sotaBadge(r,includeScope=true,excluded=[]) {
    const context=core.sotaContext(r,resultContext());if(context.status!=='frontier')return '';
    const point=context.transfer||context.annotation;
    if(hasSetting(r))return '<span class="certificate-status"><span class="sota-badge" title="State of the art in the certified setting">SOTA</span>'+(includeScope?conditionQualifiers(r,point?.conditionIds,'sota-scope',excluded):'')+'</span>';
    return '<span class="sota-badge" title="'+esc(point?.setting)+'">SOTA</span>'+(includeScope&&point?.scopeLabel?'<span class="sota-scope">'+esc(point.scopeLabel)+'</span>':'');
  }
  const tightAxis={ratio:'ratio',rounds:'rounds','approximation-order':'up to constants'};
  function tightBadge(r,includeQualifiers=true,excluded=[]) {
    const certificates=core.tightContext(r,resultContext()).certificates;
    if(hasSetting(r))return certificates.map(c=>'<span class="certificate-status" data-certificate="'+esc(c.id||c.application.certificateId)+'"><span class="tight-badge" title="'+esc(c.statement)+'">Tight · '+tightAxis[c.axis]+'</span>'+(includeQualifiers?conditionQualifiers(r,c.application.conditionIds,'tight-scope',excluded):'')+'</span>').join('');
    return [...new Set(certificates.map(c=>c.axis))].map(axis=>{
      const matches=certificates.filter(c=>c.axis===axis);
      return '<span class="tight-badge" title="'+esc(matches.map(c=>c.scopeLabel+'. '+c.parameterDomain+' '+c.statement).join('\n'))+'">Tight · '+tightAxis[axis]+'</span>';
    }).join('');
  }
  function resultBadges(r,includeQualifiers=true) {
    const scopes=[],sotaContext=core.sotaContext(r,resultContext());
    if(hasSetting(r)&&includeQualifiers){
      if(sotaContext.status==='frontier')scopes.push((sotaContext.transfer||sotaContext.annotation).conditionIds||[]);
      for(const certificate of core.tightContext(r,resultContext()).certificates)scopes.push(certificate.application.conditionIds||[]);
    }
    const shared=scopes.length>1?conditionIds(scopes[0]).filter(id=>scopes.every(scope=>scope.includes(id))):[];
    const sota=sotaBadge(r,includeQualifiers||!hasSetting(r),shared),tight=tightBadge(r,includeQualifiers,shared);
    if(!sota&&!tight)return '';
    if(hasSetting(r))return '<span class="result-certificates">'+sota+tight+conditionQualifiers(r,shared,'shared-certificate-scope')+'</span>';
    const tightScope=[...new Set(core.tightContext(r,resultContext()).certificates.map(c=>c.scopeLabel))].join(' · ');
    return '<span class="result-certificates">'+sota+tight+'</span>'+(tightScope?'<span class="tight-scope">'+esc(tightScope)+'</span>':'');
  }
  function tightDetails(r) {
    const context=core.tightContext(r,resultContext());
    const certificates=context.status==='tight'?context.certificates:context.sourceCertificates;
    if(!certificates.length)return '';
    const evidence=(certificate,side)=>{
      const source=certificate[side];
      const links=source.resultIds.filter(id=>id!==r.id).map(id=>'<button class="text-button" data-result="'+esc(id)+'">'+esc(resultMap[id].problem)+' · '+esc(paperShort(paperMap[resultMap[id].paperId]))+' →</button>').join('');
      return '<div class="tight-evidence"><strong>'+(side==='upper'?'Upper bound':'Lower bound')+'</strong><p>'+esc(source.statement)+'</p>'+links+'<a class="text-button" href="'+safeUrl(source.url)+'" target="_blank" rel="noopener">'+esc(source.title)+' · '+esc(source.location)+' ↗</a></div>';
    };
    return '<section class="detail-section tight-note"><h3>'+(context.status==='tight'?'Why this bound is tight':'Matching bounds in the source setting')+'</h3>'+(context.status==='source-only'?'<p>The matching bounds below are certified for the source setting. Their tightness has not been established for the current selection.</p>':'')+certificates.map(c=>'<article data-certificate="'+esc(c.id||c.application.certificateId)+'"><h4>Tight · '+tightAxis[c.axis]+(!hasSetting(r)?' · '+esc(c.scopeLabel):'')+'</h4>'+(hasSetting(r)?(context.status==='source-only'?conditionQualifiers(r,c.application.conditionIds,'tight-scope'):''):'<p class="tight-domain">'+esc(c.parameterDomain)+'</p>')+'<p>'+graphText(c.statement,r)+'</p>'+evidence(c,'upper')+evidence(c,'lower')+'</article>').join('')+'</section>';
  }
  function coveredByTheorem(r){return !!r.dominatedBy?.length&&r.frontierComparisons?.filter(c=>!c.domainGuard).every(c=>c.kind==='family-extension');}
  function dominanceDetails(r){
    if(!r.frontierComparisons?.length)return '';
    const names={problem:'Problem / output',graphClass:'Graph class',approximation:'Approximation',rounds:'Full round complexity',model:'Communication model',randomness:'Randomness',benchmark:'OPT benchmark',assumptions:'Other assumptions'};
    return '<section class="detail-section dominance-note"><h3>'+(coveredByTheorem(r)?'Covered by the broader theorem':r.dominatedBy?.length?'Dominated bound':'Conditional frontier comparison')+'</h3>'+(coveredByTheorem(r)?'':'<p>A frontier point must be no worse on every dimension and strictly better on at least one. These comparisons are independent of the active filters.</p>')+r.frontierComparisons.map(c=>{const better=resultMap[c.better];return '<article><button class="text-button" data-result="'+esc(c.better)+'">'+esc(better.problem)+' · '+esc(paperShort(paperMap[better.paperId]))+' →</button><p>'+graphText(c.reason,r)+'</p>'+(c.domainGuard?'<p><strong>Conditional: '+graphText(c.domainGuard,r)+'.</strong> This does not remove the entire parameterized result from the frontier.</p>':'')+(c.parameterSubstitution?'<p>Parameter substitution: '+graphText(c.parameterSubstitution,r)+'</p>':'')+'<details><summary>Why this comparison is valid</summary><dl class="detail-definition">'+Object.entries(c.conditions).map(([key,value])=>'<dt>'+esc(names[key]||key)+(c.strict.includes(key)?' · strict':'')+'</dt><dd>'+graphText(value,r)+'</dd>').join('')+'</dl></details><a class="text-button" href="'+safeUrl(c.evidenceUrl)+'" target="_blank" rel="noopener">Comparison evidence ↗</a></article>';}).join('')+'</section>';
  }
  function sotaDetails(r) {
    const context=core.sotaContext(r,resultContext());let html='';
    if(context.annotation&&context.status!=='dominated'){
      const point=context.transfer||context.annotation;
      html='<section class="sota-note"><strong>'+(context.status==='source-only'?'SOTA frontier in the source setting':'SOTA frontier in this setting')+'</strong>'+(hasSetting(r)?(context.status==='source-only'?conditionQualifiers(r,point.conditionIds,'sota-scope'):''):'<p>'+graphText(point.setting,r)+'</p>')+'<p>'+graphText(point.reason,r)+'</p>'+(context.transfer?'<p class="hint">This specialization has an explicit SOTA certificate; general applicability alone does not establish SOTA on a subclass.</p>':'')+'<a href="'+safeUrl(point.evidenceUrl)+'" target="_blank" rel="noopener">Supporting source ↗</a><span class="sota-date">Checked '+esc(context.annotation.checked)+'</span></section>';
    }
    return html+dominanceDetails(r);
  }
  function approxBound(r) {
    const a=core.effectiveApproximation(r,resultContext());
    const label=a.approximationDisplay||r.approximation;
    const bound=r.approximationParameters?.length&&/^[fF]\(/.test(label)?functionBound(r,r.approximationParameters,label,'math named-bound parameterized-bound'):resultMath(r,label);
    return bound+(a.approximationBenchmark==='fractional'?'<span class="benchmark-marker" title="Compared with the fractional optimum">vs '+math('OPT_f')+'</span>':'');
  }

  function initFilters() {
    const problems = core.problemNodes.map(n=>n.label).sort(core.compareProblems);
    $('#problem-filters').innerHTML=['',...problems].map(p=>'<button type="button" data-problem="'+esc(p)+'" aria-pressed="false">'+esc(p||'All problems')+'<span>'+core.problemPublicationCount(p)+'</span></button>').join('');
    const tags=core.graphNodes.map(n=>n.label).sort(core.compareText);
    for(const selector of ['#graph','#class-focus'])$(selector).insertAdjacentHTML('beforeend',tags.map(t=>'<option>'+esc(t)+'</option>').join(''));
    for(const selector of ['#graph','#class-focus'])window.AtlasMathSelect?.enhance($(selector));
    $('#problem-focus').innerHTML=core.problemNodes.slice().sort((a,b)=>core.compareProblems(a.label,b.label)).map(n=>'<option>'+esc(n.label)+'</option>').join('');
    $('#round-filters').innerHTML=[['','All'],['constant','Constant'],['parameter',math('f(parameters)','round-math','f(\\text{parameters})')],['logstar',math('O(log* n)','round-math')],['degree',math('f(max degree)','round-math','f(\\text{max degree})')],['logarithmic',math('O(log n)','round-math')],['polylog',math('polylog n','round-math')],['other','Other']].map(([key,label])=>'<button data-round="'+key+'" aria-label="'+esc(key?core.roundLabels[key]:'All round complexities')+'" title="'+esc(key?core.roundLabels[key]:'All round complexities')+'" aria-pressed="false">'+label+'</button>').join('');
    const source=window.ATLAS_DATA.sourceResults||results,derived=results.length-source.length;
    const fast=results.filter(r=>['constant','logstar'].includes(r.roundClass)).length;
    $('#catalog-stats').innerHTML='<span><strong>'+source.length+'</strong> source bounds</span><span><strong>'+derived+'</strong> derived</span><span><strong>'+papers.length+'</strong> paper records</span><span><strong>'+problems.length+'</strong> problems</span><span><strong>'+fast+'</strong> constant / '+math('log* n')+'</span>';
  }

  function roundLabel(key, className='math') {
    return key==='constant'?'<span class="'+esc(className)+' constant-label">Constant</span>':math(roundSymbols[key],className);
  }
  function scopedRoundsRecord(r) {
    const rounds=core.effectiveRounds(r,resultContext());
    return rounds.specialization?{...r,roundsDisplay:rounds.roundsDisplay,roundParameters:rounds.roundParameters,roundComplexityDetails:rounds.roundComplexityDetails}:r;
  }
  function roundDisplayParts(r,label) {
    const suffix=' rounds ruled out';
    const inline=label.endsWith(suffix);
    const excluded=r.roundBudgetExcluded||r.roundComplexityDetails?.status==='impossibility'||inline;
    return {
      formula:inline?label.slice(0,-suffix.length):label,
      caption:excluded?'<span class="round-budget-exclusion">rounds ruled out</span>':''
    };
  }
  function roundBound(r) {
    r=scopedRoundsRecord(r);
    if(r.roundParameters) {
      return functionBound(r,r.roundParameters,r.roundsDisplay,'round-bound named-bound');
    }
    const display=roundDisplayParts(r,r.roundsDisplay||r.rounds);
    const lines=display.formula.split(/\s*;\s*/);
    // Separate round resources and the impossibility caption only in the display.
    const texLines=window.ATLAS_DATA.notation[display.formula]?.split(/;\s*(?:\\(?:qquad|quad)\s*)?/);
    return '<span class="round-bound'+(lines.length>1?' stacked-bound':'')+'">'+lines.map((line,index)=>resultMath(r,line,'math',texLines?.length===lines.length?texLines[index]:undefined)).join('\n')+display.caption+'</span>';
  }
  function detailedRoundBound(r) {
    r=scopedRoundsRecord(r);
    const detail=r.roundComplexityDetails;
    if(!detail)return roundBound(r);
    const captions={partial:'Partial expansion','not-stated':'Dependence left implicit in the checked source','not-extracted':'A finer expression has not yet been extracted'};
    const expanded=['explicit','partial','impossibility'].includes(detail.status);
    const display=roundDisplayParts(r,detail.formula);
    const tex=display.formula===detail.formula?detail.tex:window.ATLAS_DATA.notation[display.formula];
    const content=detail.expression?resultMath(r,detail.expression.formula,'math',detail.expression.tex)+'<span class="round-bound-context">'+resultMath(r,detail.suffix.formula,'math',detail.suffix.tex.replace(/^,\s*\\qquad\s*/,''))+'</span>':resultMath(r,display.formula,'math',tex);
    const context=detail.expression?' role="group" aria-label="'+esc(detail.formula)+'"':'';
    const bound=!expanded||detail.formula===r.roundsDisplay&&detail.formula.includes(';')?roundBound(r):'<span class="round-bound full-round-bound"'+context+'>'+content+display.caption+'</span>';
    return bound+(captions[detail.status]?'<span class="cell-secondary round-complexity-status" data-round-detail-status="'+esc(detail.status)+'">'+esc(captions[detail.status])+'</span>':'');
  }
  function roundComplexityNote(r) {
    r=scopedRoundsRecord(r);
    const detail=r.roundComplexityDetails;
    if(!detail||r.roundCountEvidence||detail.status==='explicit'&&!detail.audited)return '';
    return '<section class="detail-section round-complexity-note"><h3>Round complexity in the source</h3><p>'+esc(detail.explanation)+'</p><ul>'+detail.evidence.map(e=>'<li><a href="'+safeUrl(e.url)+'" target="_blank" rel="noopener">'+esc(e.title)+' ↗</a> · '+esc(e.location)+'</li>').join('')+'</ul></section>';
  }
  function roundCountDetails(r) {
    const audit=r.roundCountEvidence;if(!audit)return '';
    const labels={stated:'Round count stated in the paper','same-algorithm':'The same algorithm has the stated schedule','phase-count':'Conservative upper bound from the communication phases','not-specified':'Total round count not specified',unavailable:'Full algorithm unavailable for counting rounds'};
    return '<section class="detail-section round-count-note"><h3>Round count</h3><p><strong>'+esc(labels[audit.basis])+'.</strong> '+esc(audit.explanation)+'</p><ul>'+audit.evidence.map(e=>'<li><a href="'+safeUrl(e.url)+'" target="_blank" rel="noopener">'+esc(e.title)+' ↗</a> · '+esc(e.location)+'</li>').join('')+'</ul></section>';
  }

  function relatedReferences(r) {
    const seen=new Set([r.paperId]);
    return (r.relatedResults||[]).map(id=>resultMap[id]).filter(other=>{if(seen.has(other.paperId))return false;seen.add(other.paperId);return true;}).map(other=>'<span class="related-reference">Related: <button class="reference-button" data-result="'+esc(other.id)+'">'+esc(paperShort(paperMap[other.paperId]))+'</button></span>').join('');
  }
  function relatedDetails(r) {
    return r.relatedResults?.length?'<section class="detail-section related-results"><h3>Related results</h3><p>Each result retains its own problem, graph assumptions and round complexity.</p><ul>'+r.relatedResults.map(id=>{const other=resultMap[id];return '<li><button class="text-button" data-result="'+esc(id)+'">'+esc(paperShort(paperMap[other.paperId]))+' · '+esc(other.theorem)+' →</button><span class="cell-secondary">'+graphText(other.graphClass,other)+'</span></li>';}).join('')+'</ul></section>':'';
  }

  function graphTransfer(r) {
    const match=core.graphMatch(r,resultContext());
    if(!match.inherited)return '';
    const path=match.path.nodes.map(id=>core.resolveClass(id).label).join(' ⊆ ');
    return '<button class="class-transfer" data-result="'+esc(r.id)+'" title="'+esc(path)+'">'+(r.bound==='lower'?'Hard subclass':'Via superclass')+' ↗</button>';
  }
  function graphTransferDetails(r) {
    const match=core.graphMatch(r,resultContext());
    if(!match.inherited)return '';
    return '<section class="graph-transfer-note"><strong>'+graphText(match.target.label,r)+' · graph-class implication</strong><p>'+graphPath(match.path.nodes)+'</p><p>'+(r.bound==='lower'?'This lower bound holds on a subclass of the selected family.':'The selected family is contained in the algorithm’s graph class. Fixed parameters must be instantiated for that family.')+' Other source assumptions remain required.</p><ul>'+match.path.edges.map(e=>'<li>'+graphText(e.reason,r)+'</li>').join('')+'</ul>'+(match.scope.note?'<p>'+graphText(match.scope.note,r)+'</p>':'')+'</section>';
  }
  function problemTransfer(r){
    const match=core.problemMatch(r,resultContext());
    if(!match.inherited)return '';
    return '<button class="class-transfer problem-transfer" data-result="'+esc(r.id)+'" title="'+esc(match.path.nodes.map(id=>core.resolveProblem(id).label).join(' → '))+'">'+(r.bound==='lower'?'Hard special case':'Solves '+esc(match.target.label))+' ↗</button>';
  }
  function problemTransferDetails(r){
    const match=core.problemMatch(r,resultContext());
    if(!match.inherited)return '';
    return '<section class="graph-transfer-note problem-transfer-note"><strong>'+esc(match.target.label)+' · problem specialization</strong><p>'+esc(match.path.nodes.map(id=>core.resolveProblem(id).label).join(' → '))+'</p><p>'+(r.bound==='lower'?'The source problem is a certified special case of the selected problem.':'The selected problem is a certified special case of the source formulation on the same communication graph.')+' The source ratio and round complexity apply with the substitutions below; other source assumptions remain required.</p><ul>'+match.path.edges.map(e=>{const ref=core.problemNetwork.references[e.reference];return '<li>'+esc(e.reason)+(ref?' <a href="'+safeUrl(ref.url)+'" target="_blank" rel="noopener">Source ↗</a>':'')+'</li>';}).join('')+'</ul></section>';
  }
  function networkEdgeSource(reference) {
    return reference?'<p class="network-edge-source"><a href="'+safeUrl(reference.url)+'" target="_blank" rel="noopener">'+esc(reference.title)+' ↗</a></p>':'';
  }
  function classEdgeDetails(edge) {
    const path=edge.pathNodes||[edge.source,edge.target];
    const steps=path.slice(1).map((target,index)=>core.graphNetwork.edges.find(e=>e.subset===path[index]&&e.superset===target));
    if(steps.some(e=>!e))return '<p>'+graphText(edge.description)+'</p>';
    const detail=e=>{
      const bindings=Object.entries(e.parameterBindings||{});
      const parameters=bindings.length?'<details class="network-edge-binding"><summary>Parameter binding</summary><p>'+bindings.map(([role,value])=>role==='excluded-minor'?'Excluded minor: '+math('H = '+value,'math graph-math','H='+window.ATLAS_DATA.notation[value]):esc(role)+': '+graphText(value)).join('; ')+'</p></details>':'';
      return '<p>'+graphText(e.reason)+'</p>'+parameters+(e.lower?'':'<p class="network-edge-caveat">Lower-bound transfer through this parameter choice is not inferred.</p>')+networkEdgeSource(core.graphNetwork.references[e.reference]);
    };
    if(steps.length===1)return '<span class="relation-type">Direct inclusion</span>'+detail(steps[0]);
    return '<span class="relation-type">Inclusion through '+steps.length+' steps</span><ol class="network-edge-steps">'+steps.map(e=>'<li><strong>'+graphPath([e.subset,e.superset])+'</strong>'+detail(e)+'</li>').join('')+'</ol>';
  }
  function problemRelationKind(edge,mode) {
    return edge.kind==='approximation-reduction'?'reduction':edge.kind==='relaxation'?'relaxation':edge[mode]?'certified':'structural';
  }
  function problemEdgeDetails(edge,mode) {
    const e=core.problemNetwork.edges.find(e=>e.special===edge.source&&e.general===edge.target);
    if(!e)return '<p>'+esc(edge.description)+'</p>';
    const kind=problemRelationKind(e,mode);
    if(kind==='reduction'){
      const recipes=(e.reductions||[]).map(id=>core.reductions.find(r=>r.id===id)).filter(Boolean);
      return '<span class="relation-type reduction">Approximation reduction</span>'+recipes.map(r=>
        '<p>Use a '+esc(core.resolveProblem(r.to).label.toLowerCase())+' algorithm to approximate '+esc(core.resolveProblem(r.from).label.toLowerCase())+'.</p>'+
        '<div class="network-reduction-metrics"><p>Approximation guarantee '+math(r.guarantee,'math',undefined,r.parameterDefinitions)+'</p><p>Round complexity '+math(r.runtime,'math',undefined,r.parameterDefinitions)+'</p></div>'+
        '<p class="network-edge-caveat">'+conditionHtml([...(r.engine?.targetInputConditions||[]),'weights-unweighted'])+'</p>'+
        (mode==='lower'?'<p class="network-edge-caveat">No automatic lower-bound transfer is certified by this rule.</p>':'')+
        '<button class="text-button" data-reduction-open="'+esc(r.id)+'">Construction and conditions →</button>'+networkEdgeSource(r.source)).join('');
    }
    const label=kind==='relaxation'?'LP relaxation':kind==='certified'?'Certified '+(mode==='upper'?'algorithm':'lower-bound')+' transfer':'Formulation only';
    const qualification=kind==='certified'?'Source assumptions and parameter restrictions remain required.':kind==='structural'?'No automatic '+(mode==='upper'?'algorithm':'lower-bound')+' transfer.':'';
    return '<span class="relation-type '+kind+'">'+label+'</span><p>'+esc(e.reason)+'</p>'+(qualification?'<p class="network-edge-caveat">'+qualification+'</p>':'')+networkEdgeSource(core.problemNetwork.references[e.reference]);
  }
  function renderClassNetwork() {
    const focus=core.resolveClass(state.classFocus)||core.resolveClass('Planar');
    $('#class-focus').value=focus.label;
    window.AtlasMathSelect?.sync($('#class-focus'));
    const related=new Set(core.graphNodes.filter(n=>n.id===focus.id||core.inclusionPath(n.id,focus.id)||core.inclusionPath(focus.id,n.id)).map(n=>n.id));
    window.AtlasNetwork.render($('#class-network'),{
      kind:'class',layoutMode:'focused',focusId:focus.id,label:'Graph-class inclusion network focused on '+focus.label,
      edgeDetails:classEdgeDetails,
      nodes:core.graphNodes.map(n=>({...n,related:related.has(n.id)})),
      edges:core.graphNetwork.edges.map(e=>({...e,source:e.subset,target:e.superset,kind:'inclusion',related:related.has(e.subset)&&related.has(e.superset),description:core.resolveClass(e.subset).label+' ⊆ '+core.resolveClass(e.superset).label+'. '+e.reason+(e.lower?'':' Lower-bound transfer through this parameter choice is not inferred.')}))
    });
    $('#class-description').innerHTML=graphText(focus.description);
    const applicable=core.filtered(results,paperMap,{graph:focus.label,bound:state.explorerBound,classTransfer:true});
    $('#class-results').textContent='Show '+applicable.length+' class-compatible bounds →';
    $('#class-results').dataset.class=focus.label;
    const adjacent=core.graphNetwork.edges.filter(e=>e.subset===focus.id||e.superset===focus.id);
    $('#class-evidence').innerHTML='<summary>Direct inclusions and sources ('+adjacent.length+')</summary><ul>'+adjacent.map(e=>{const ref=core.graphNetwork.references[e.reference];return '<li><strong>'+graphPath([e.subset,e.superset])+'</strong><p>'+graphText(e.reason)+(e.lower?'':' Lower-bound transfer through this parameter choice is not inferred.')+(ref?' <a href="'+safeUrl(ref.url)+'" target="_blank" rel="noopener">'+esc(ref.title)+' ↗</a>':'')+'</p></li>';}).join('')+'</ul>';
    typeset($('#class-network-section'));
  }

  function renderProblemNetwork() {
    const focus=core.resolveProblem(state.problemFocus)||core.resolveProblem('Dominating set');
    $('#problem-focus').value=focus.label;
    const mode=state.explorerBound==='lower'?'lower':'upper';
    const related=new Set(core.problemNodes.filter(n=>n.id===focus.id||core.problemPath(n.id,focus.id,'all')||core.problemPath(focus.id,n.id,'all')).map(n=>n.id));
    window.AtlasNetwork.render($('#problem-network'),{
      kind:'problem',focusId:focus.id,label:'Problem inclusion network; selected problem '+focus.label,
      edgeDetails:edge=>problemEdgeDetails(edge,mode),
      nodes:core.problemNodes.map(n=>({...n,related:related.has(n.id)})),
      edges:core.problemNetwork.edges.map(e=>({...e,source:e.special,target:e.general,kind:problemRelationKind(e,mode),related:related.has(e.special)&&related.has(e.general),description:core.resolveProblem(e.special).label+' → '+core.resolveProblem(e.general).label+'. '+e.reason+(e.kind==='approximation-reduction'?' Approximation loss and round complexity are specified by the reduction.':e.kind==='relaxation'?' An LP solution alone does not give an integral approximation.':e[mode]?' Certified transfer in the selected direction.':' Formulation only; no automatic bound transfer.')}))
    });
    $('#problem-description').textContent=focus.description;
    const applicable=core.filtered(results,paperMap,{problem:focus.label,bound:state.explorerBound,problemTransfer:true});
    $('#problem-results').textContent='Show '+applicable.length+' problem-compatible bounds →';
    $('#problem-results').dataset.problemResults=focus.label;
    const adjacent=core.problemNetwork.edges.filter(e=>e.special===focus.id||e.general===focus.id);
    $('#problem-evidence').innerHTML='<summary>Relationships, transfer conditions and sources ('+adjacent.length+')</summary><ul>'+adjacent.map(e=>'<li><strong>'+esc(core.resolveProblem(e.special).label)+' → '+esc(core.resolveProblem(e.general).label)+'</strong>'+problemEdgeDetails({...e,source:e.special,target:e.general},mode)+'</li>').join('')+'</ul>';
  }

  function derivedBadge(r){
    if(r.verification!=='derived')return '';
    return '<button class="class-transfer derived-badge" data-result="'+esc(r.id)+'" title="Computed from '+esc(r.sourceProblem)+' through '+r.reductionPath.length+' reduction step(s)">Derived · '+r.reductionPath.length+' '+(r.reductionPath.length===1?'step':'steps')+' ↗</button>';
  }
  function derivedDetails(r){
    if(r.verification!=='derived')return '';
    const base=resultMap[r.sourceResultId];
    return '<section class="detail-section derived-note"><h3>Computed reduction chain</h3><p>This bound is a consequence computed by the atlas. The original paper provides the algorithm and its guarantees; the rules below supply the transformed instance, guarantee and communication cost.</p><ol>'+r.reductionSteps.map(step=>{const recipe=core.reductions.find(e=>e.id===step.id);return '<li><button class="text-button" data-reduction-open="'+esc(step.id)+'">'+esc(step.title)+' →</button><p>'+esc(core.resolveProblem(step.from).label)+' → '+esc(core.resolveProblem(step.to).label)+'</p><p>Round conversion: '+resultMath(r,recipe.runtime)+' · Guarantee: '+resultMath(r,recipe.guarantee)+'</p>'+(Object.keys(step.substitutions).length?'<p>Exact instance parameters: '+Object.entries(step.substitutions).map(([key,value])=>resultMath(r,key)+' = '+resultMath(r,value)).join('; ')+'.</p>':'')+'<ul>'+step.conditions.concat(step.assumptions||[]).map(c=>'<li>'+graphText(c,r)+'</li>').join('')+'</ul>'+(step.modelConversion?'<p>'+esc(step.modelConversion)+'</p>':'')+'</li>';}).join('')+'</ol><p><button class="text-button" data-result="'+esc(base.id)+'">Original algorithm: '+esc(base.problem)+' · '+esc(paperShort(paperMap[base.paperId]))+' →</button></p><p class="hint">The source’s assumptions are evaluated on the transformed instance. A reduction does not automatically transfer a SOTA certificate.</p></section>';
  }

  function resultRow(r,region) {
    const p=paperMap[r.paperId];
    const edges=(region.start?' problem-region-start':'')+(region.end?' problem-region-end':'');
    const marker=region.start?'<td class="problem-region-marker" rowspan="'+region.size+'" data-region-problem="'+esc(r.problem)+'" aria-hidden="true"><span class="problem-region-bracket"></span></td>':'';
    return '<tr class="result-row'+edges+(core.sotaApplies(r,state)?' sota-row':'')+'" data-problem-region="'+region.id+'" data-region-problem="'+esc(r.problem)+'">'+marker+'<td class="select-cell"><label class="select-target"><input type="checkbox" data-select="'+esc(r.id)+'" '+(selected.has(r.id)?'checked':'')+' aria-label="Compare '+esc(r.problem+', '+(core.effectiveApproximation(r,resultContext()).approximationDisplay||r.approximation)+', '+paperShort(p))+'"></label></td><td><button class="problem-button" data-result="'+esc(r.id)+'"'+parameterContextAttrs(r,r.problem)+'>'+parameterText(r,r.problem,false)+'</button>'+'<span class="result-statuses">'+resultBadges(r)+graphTransfer(r)+problemTransfer(r)+derivedBadge(r)+'</span><span class="cell-secondary result-setting">'+settingSummary(r)+'</span>'+'</td><td class="approx-cell">'+(r.bound==='lower'?'<span class="lower-badge">Lower bound</span><br>':'')+approxBound(r)+'</td><td class="round-cell">'+roundBound(r)+'</td><td>'+modelBadge(r)+'<span class="type-text">'+esc(r.randomization)+'</span></td><td><button class="reference-button" data-result="'+esc(r.id)+'">'+esc(paperShort(p))+'</button>'+folkloreBadge(r)+(r.dominatedBy?.length?'<button class="dominance-badge" data-result="'+esc(r.id)+'" >'+(coveredByTheorem(r)?'Covered by broader theorem':'Dominated bound')+' ↗</button>':'')+(isPreprint(p)?'<span class="preprint-mark">Preprint</span>':'')+(r.caveat?'<span class="caveat-badge">Source caveat</span>':'')+'</td><td><div class="result-actions"><button class="cite-button" type="button" data-cite="'+esc(p.id)+'" title="Copy BibTeX citation" aria-label="Copy BibTeX for '+esc(p.title)+'">BibTeX</button><button class="detail-arrow" data-result="'+esc(r.id)+'" aria-label="Details for '+esc(r.problem+', '+r.id)+'">↗</button></div></td></tr>';
  }
  function renderCatalog() {
    visible=core.filtered(results,paperMap,state);
    $('#search').value=state.q;
    $('#search-clear').hidden=!state.q;
    $('#result-scroll').scrollTop=0;
    $$('[data-filter]').forEach(el=>{if(el.type==='checkbox')el.checked=state[el.dataset.filter];else el.value=state[el.dataset.filter];});
    window.AtlasMathSelect?.sync();
    $$('[data-problem]').forEach(el=>{
      el.setAttribute('aria-pressed',String(el.dataset.problem===state.problem));
      const count=core.problemPublicationCount(el.dataset.problem),label=count+' '+(count===1?'publication':'publications');
      el.querySelector('span').textContent=count;
      el.setAttribute('aria-label',(el.dataset.problem||'All problems')+', '+label);
      el.title=label+' with source bounds; computed reductions and folklore are excluded.';
    });
    $$('[data-round]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.round===state.round)));
    const graphContext=core.searchContext(state);
    const inherited=visible.filter(r=>core.graphMatch(r,state).inherited).length;
    $('#graph-match-note').hidden=!graphContext.target;
    const graphSummary=state.classTransfer?(inherited?inherited+(inherited===1?' bound':' bounds')+' from graph inclusions':'No additional bounds from graph inclusions'):'Exact graph class only';
    $('#graph-match-note').innerHTML=graphContext.target?'<details class="context-details"><summary><strong>'+graphText(graphContext.target.label,null,false)+(graphContext.fromSearch?' · recognized in search':'')+'</strong> · '+graphSummary+'</summary><p>'+(state.classTransfer?'Algorithms for containing graph classes and lower bounds for certified subclasses are included. Other source assumptions remain required.':'Only the graph family stated in the source is matched.')+'</p></details><button class="text-button" data-network-focus="'+esc(graphContext.target.label)+'">Graph network →</button>':'';
    const problemContext=graphContext.problemTarget,problemInherited=visible.filter(r=>r.verification==='derived'||core.problemMatch(r,state).inherited).length;
    $('#problem-match-note').hidden=!problemContext;
    const problemReductionSummary=!state.problemTransfer?'Only bounds stated directly for this problem are shown.':problemInherited?problemInherited+' displayed '+(problemInherited===1?'bound follows':'bounds follow')+' from problem reductions.':'No additional bounds from problem reductions match these filters.';
    const problemReductionDetails=state.problemTransfer&&problemInherited?' Open a result for the reduction, its assumptions and the original source.':'';
    const problemRoundingNote=state.problemTransfer&&/^(integral-|integer-)/.test(problemContext?.outputKind||'')?' An LP relaxation permits fractional solutions. Using an LP algorithm for an integer problem requires a rounding argument with an approximation guarantee.':'';
    const problemSummary=!state.problemTransfer?'Direct results only':problemInherited?problemInherited+(problemInherited===1?' bound':' bounds')+' from problem reductions':'No additional bounds from reductions';
    $('#problem-match-note').innerHTML=problemContext?'<details class="context-details"><summary><strong>'+esc(problemContext.label)+(graphContext.problemFromSearch?' · recognized in search':'')+'</strong> · '+problemSummary+'</summary><p>'+problemReductionSummary+problemReductionDetails+problemRoundingNote+'</p></details><button class="text-button" data-problem-network-focus="'+esc(problemContext.label)+'">Problem network →</button>':'';
    $('#result-count').innerHTML='<strong>'+visible.length+'</strong> '+(visible.length===1?'result':'results');
    $('#result-count').setAttribute('aria-label',visible.length+' matching '+(visible.length===1?'result':'results')+' out of '+results.length+' catalog entries');
    const tags=['problem','paper','model','graph','randomization','bound','transfer'].filter(key=>state[key]);
    $('#active-filters').innerHTML=tags.map(key=>'<button data-clear="'+key+'" aria-label="Clear '+esc(key==='constantRatio'?'constant ratio':key)+' filter">'+graphText(key==='sota'?'SOTA only':key==='constantRatio'?'Constant ratio only':key==='transfer'?'Model implications':key==='round'?core.roundLabels[state[key]]:key==='paper'?(paperMap[state[key]]?paperShort(paperMap[state[key]]):state[key]):key==='bound'?(state.bound==='upper'?'Algorithms':'Lower bounds'):state[key],null,false)+' ×</button>').join('');
    const advanced=['problem','paper','model','graph','randomization','bound','transfer'].filter(k=>state[k]).length;
    $('#filters-count').textContent=advanced?' · '+advanced+' active':'';
    // Filtering and sorting do not change a result's formulas. Keep its DOM
    // (including MathJax SVGs) until the graph/problem setting or model changes.
    const settingKey=JSON.stringify([graphContext.target?.id,graphContext.problemTarget?.id,state.classTransfer,state.problemTransfer,state.model]);
    if(settingKey!==rowSettingKey){rowCache.clear();rowSettingKey=settingKey;}
    const roundCounts=new Map();
    for(const result of visible)roundCounts.set(result.roundClass,(roundCounts.get(result.roundClass)||0)+1);
    let previousRound='',regionIndex=0;
    const layout=[];
    for(let start=0;start<visible.length;){
      const first=visible[start];
      if(state.sort==='rounds'&&first.roundClass!==previousRound){
        previousRound=first.roundClass;
        const other=first.roundClass==='other';
        const count=roundCounts.get(first.roundClass);
        layout.push('<tr class="group-row"><td colspan="8"><h3 class="group-heading"><span class="group-label">'+roundLabel(first.roundClass,'group-symbol')+' <span class="group-title">'+(other?'round complexities':'rounds')+'</span></span><span class="group-meta">'+(other?'':'· ')+count+' results'+(other?' · Trade-offs and additional regimes':'')+'</span></h3></td></tr>');
      }
      let end=start+1;
      while(end<visible.length&&visible[end].problem===first.problem&&
            (state.sort!=='rounds'||visible[end].roundClass===first.roundClass))end++;
      const id='problem-region-'+regionIndex++;
      for(let i=start;i<end;i++)layout.push({result:visible[i],region:{id,size:end-start,start:i===start,end:i===end-1}});
      start=end;
    }
    const staging=document.createElement('tbody'),fragment=document.createDocumentFragment();
    staging.innerHTML=layout.filter(item=>typeof item!=='string'&&!rowCache.has(item.result.id)).map(({result,region})=>resultRow(result,region)).join('');
    for(const row of [...staging.children])rowCache.set(row.querySelector('[data-select]').dataset.select,row);
    for(const item of layout){
      if(typeof item==='string'){staging.innerHTML=item;fragment.append(staging.firstElementChild);continue;}
      const {result,region}=item,row=rowCache.get(result.id);
      row.dataset.problemRegion=region.id;
      row.classList.toggle('problem-region-start',region.start);
      row.classList.toggle('problem-region-end',region.end);
      let marker=row.querySelector('.problem-region-marker');
      if(region.start){
        if(!marker){marker=document.createElement('td');marker.className='problem-region-marker';marker.setAttribute('aria-hidden','true');marker.innerHTML='<span class="problem-region-bracket"></span>';row.prepend(marker);}
        marker.rowSpan=region.size;marker.dataset.regionProblem=result.problem;
      }else marker?.remove();
      row.querySelector('[data-select]').checked=selected.has(result.id);
      fragment.append(row);
    }
    $('#results-body').replaceChildren(fragment);
    $('#empty').hidden=visible.length>0;
    $('#result-scroll').hidden=visible.length===0;
    $('#export').disabled=visible.length===0;
    $('#export-bibtex').disabled=visible.length===0;
    renderCompareBar();
  }
  function renderCompareBar() {
    $('#compare-bar').hidden=selected.size===0;
    $('#compare-count').textContent=selected.size+' of 4 selected';
    $('#compare-open').disabled=selected.size<2;
    const outside=[...selected].filter(id=>!visible.some(r=>r.id===id)).length;
    $('#compare-hidden').textContent=outside?outside+' outside current filters':'';
  }

  function renderExplorer() {
    $('#explorer-bound').value=state.explorerBound;
    const bound=state.explorerBound;
    const problems=core.problemNodes.map(n=>n.label).sort(core.compareProblems);
    const counts=problems.map(p=>{const subset=core.filtered(results,paperMap,{problem:p,bound,problemTransfer:true});return core.roundOrder.map(round=>subset.filter(r=>r.roundClass===round).length);});
    const max=Math.max(1,...counts.flat());
    $('#matrix').innerHTML='<table class="matrix"><caption class="sr-only">Number of results by problem and round regime</caption><thead><tr><th>Problem</th>'+core.roundOrder.map(key=>'<th>'+roundLabel(key)+'</th>').join('')+'</tr></thead><tbody>'+problems.map((p,i)=>'<tr><th scope="row">'+esc(p)+'</th>'+counts[i].map((count,j)=>'<td>'+(count?'<button data-matrix-problem="'+esc(p)+'" data-matrix-round="'+core.roundOrder[j]+'" style="--heat:'+(6+Math.round(count/max*21))+'%;--heat-alpha:'+((6+Math.round(count/max*21))/100)+'" aria-label="'+count+' '+esc(p)+' results, '+core.roundLabels[core.roundOrder[j]]+'">'+count+'</button>':'<span class="zero" role="img" aria-label="No cataloged results">—</span>')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
    renderClassNetwork();
    renderProblemNetwork();
  }
  function renderBibliography() {
    $('#bib-search').value=state.bibq;
    const query=state.bibq;
    const rows=papers.filter(p=>core.searchMatches(p.title+' '+p.authors+' '+p.venue+' '+p.year,query)).sort((a,b)=>b.year-a.year||core.compareText(a.title,b.title)||core.compareText(a.authors,b.authors)||core.compareText(a.id,b.id));
    $('#bibliography-count').textContent=rows.length+' of '+papers.length+' paper records · conference, journal and preprint versions';
    let year=0;
    $('#bibliography-list').innerHTML=rows.map(p=>{
      const heading=p.year!==year?'<h3 class="bibliography-year">'+p.year+'</h3>':'';year=p.year;
      const count=results.filter(r=>r.paperId===p.id).length;
      const venue=new RegExp('\\b'+p.year+'\\b').test(p.venue)?p.venue:p.venue+' · '+p.year;
      return heading+'<article class="paper-entry '+(isPreprint(p)?'preprint':'')+'"><h3><a href="'+safeUrl(p.url)+'" target="_blank" rel="noopener">'+esc(p.title)+' ↗</a></h3><p>'+esc(p.authors)+'</p><p class="paper-meta">'+esc(venue)+'</p>'+(p.notes?'<p class="paper-meta paper-comments">Comments: '+esc(p.notes)+'</p>':'')+'<div class="paper-actions">'+(count?'<button class="text-button" data-paper-results="'+esc(p.id)+'">'+count+' recorded '+(count===1?'bound':'bounds')+' →</button>':'<span class="hint">Bibliography only · see note</span>')+'<button class="text-button" data-bib="'+esc(p.id)+'">Copy BibTeX</button><a href="'+safeUrl(p.url)+'" target="_blank" rel="noopener">Read paper ↗</a></div></article>';
    }).join('')||'<div class="empty"><h3>No matching papers</h3><p>Try an author name or a shorter title.</p></div>';
  }
  function render() {
    const names={catalog:'Reference',explorer:'Explorer',reductions:'Reductions',bibliography:'Bibliography',about:'Reading the atlas'};
    document.body.dataset.currentView=state.view;
    document.title=names[state.view]+' · Distributed approximation atlas';
    views.forEach(view=>$('#'+view+'-view').hidden=state.view!==view);
    $$('[data-view]').forEach(el=>{if(el.dataset.view===state.view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    if(state.view==='catalog')renderCatalog();
    if(state.view==='explorer')renderExplorer();
    if(state.view==='bibliography')renderBibliography();
    if(state.view==='reductions')reductionsView.render();
    if(state.view!=='reductions')typeset($('#'+state.view+'-view'));
    queueViewportFit();
  }

  function openDialog(content,comparison=false) {
    const dialog=$('#detail-dialog');dialog.classList.toggle('compare-dialog',comparison);
    $('#dialog-content').innerHTML=content;
    if(!dialog.open){dialogOpener=document.activeElement;dialog.showModal();}
    $('#dialog-title').setAttribute('tabindex','-1');
    $('#dialog-title').focus({preventScroll:true});
    dialog.scrollTop=0;
    typeset(dialog);
  }
  function openResult(id) {
    const r=resultMap[id];if(!r)return;
    const p=paperMap[r.paperId];activeResult=id;writeLocation();document.title=r.problem+' · Distributed approximation atlas';
    const header='<div class="dialog-eyebrow">'+modelBadge(r)+'<span>'+esc(r.randomization)+'</span><span>·</span><span>'+r.year+'</span>'+(r.bound==='lower'?'<span class="lower-badge">Lower bound</span>':'')+resultBadges(r,true)+folkloreBadge(r)+'</div><h2 id="dialog-title">'+parameterText(r,r.problem,false)+'</h2>'+(!hasSetting(r)?'<div class="dialog-subtitle">'+(r.variant?esc(r.variant)+' · ':'')+graphText(r.graphClass,r)+'</div>':'');
    const metrics='<div class="detail-metrics"><div class="metric"><span>'+(r.bound==='upper'?'Approximation guarantee':'Excluded / necessary guarantee')+'</span>'+approxBound(r)+'</div><div class="metric"><span>'+(r.bound==='lower'?'Excluded / necessary round complexity':'Round complexity')+'</span><div class="round-complexity-detail">'+detailedRoundBound(r)+'</div></div></div>';
    const transfers=graphTransferDetails(r)+problemTransferDetails(r);
    const transferDetails=transfers?'<details class="setting-transfer-details"><summary>Graph and problem implications</summary>'+transfers+'</details>':'';
    const caveat=r.caveat?'<div class="source-caveat"><strong>Source caveat</strong><p>'+esc(r.caveat)+'</p>'+(r.caveatUrl?'<a href="'+safeUrl(r.caveatUrl)+'" target="_blank" rel="noopener">Read the later discussion ↗</a>':'')+'</div>':'';
    const construction=r.attribution!=='folklore'&&(r.algorithm||r.proofSketch)?'<section class="detail-section construction-note">'+(r.algorithm?'<h3>Construction</h3><p>'+esc(r.algorithm)+'</p>':'')+(r.proofSketch?'<h3>Why the guarantee holds</h3><p>'+esc(r.proofSketch)+'</p>':'')+(r.proofFormula?resultMath(r,r.proofFormula):'')+'</section>':'';
    const source='<section class="detail-section"><h3>Source</h3><p class="citation"><a href="'+safeUrl(p.url)+'" target="_blank" rel="noopener"><strong>'+esc(p.title)+' ↗</strong></a><br>'+esc(p.authors)+'<br>'+esc(p.venue)+' · '+p.year+'</p>'+(p.notes?'<p class="hint">'+esc(p.notes)+'</p>':'')+'<a class="text-button" href="'+safeUrl(r.sourceUrl)+'" target="_blank" rel="noopener">Source location: '+esc(r.theorem)+' ↗</a><div class="source-note">'+(r.verification==='derived'?'Computed from a source bound and certified reduction rules':r.derivationNote?'Base construction checked in the primary source; broader scope derived above':r.verification==='primary'?'Primary source checked':'Transcribed from secondary bibliography')+' · '+esc(r.theorem)+'. '+(isPreprint(p)?'This record cites a preprint. ':'')+'Check means the claim was located in the source; it is not an independent proof review.</div>'+originalSourceFields(r)+'</section>';
    const actions='<div class="dialog-actions"><a class="button" href="'+safeUrl(r.sourceUrl)+'" target="_blank" rel="noopener">Read source ↗</a><button class="button subtle" data-bib="'+esc(p.id)+'">Copy BibTeX</button><button class="button subtle" data-result-link="'+esc(r.id)+'">Copy result link</button><button class="text-button" data-correction="'+esc(r.id)+'">Download correction template ↓</button></div>';
    openDialog(header+metrics+settingDetails(r)+transferDetails+caveat+(!hasSetting(r)?'<p>'+esc(r.summary)+'</p>':'')+sotaDetails(r)+roundCountDetails(r)+roundComplexityNote(r)+derivedDetails(r)+folkloreDetails(r)+construction+tightDetails(r)+relatedDetails(r)+source+actions);
  }
  function comparisonSota(r) {
    if(r.dominatedBy?.length)return (coveredByTheorem(r)?'Covered by ':'Dominated by ')+r.dominatedBy.map(id=>'<button class="text-button" data-result="'+esc(id)+'">'+esc(paperShort(paperMap[resultMap[id].paperId]))+' →</button>').join(', ');
    const context=core.sotaContext(r,resultContext()),point=context.transfer||context.annotation;
    if(!point)return 'Not yet certified; absence of a dominator is not a SOTA claim.';
    return (context.status==='source-only'?'<p>Certified in the source setting only.</p>':'')+(hasSetting(r)?(context.status==='source-only'?conditionQualifiers(r,point.conditionIds,'sota-scope'):''):'<p>'+graphText(point.setting,r)+'</p>')+'<p>'+graphText(point.reason,r)+'</p><a href="'+safeUrl(point.evidenceUrl)+'" target="_blank" rel="noopener">Evidence ↗</a>';
  }
  function comparisonTight(r) {
    const context=core.tightContext(r,resultContext()),certificates=context.status==='tight'?context.certificates:context.sourceCertificates;
    if(!certificates.length)return 'No matching-bound certificate recorded.';
    return (context.status==='source-only'?'<p>Matching bounds are certified in the source setting only.</p>':'')+certificates.map(c=>'<article class="comparison-certificate" data-certificate="'+esc(c.id||c.application.certificateId)+'"><strong>Tight · '+tightAxis[c.axis]+'</strong>'+(hasSetting(r)?(context.status==='source-only'?conditionQualifiers(r,c.application.conditionIds,'tight-scope'):''):'<p>'+graphText(c.scopeLabel,r)+'</p>')+'<p>'+graphText(c.statement,r)+'</p></article>').join('');
  }
  function comparisonSetting(r,key) {
    if(hasSetting(r))return conditionHtml(settingGroups(r)[key],'',r)||'—';
    return esc(key==='parameters'?r.parameters:r.assumptions)||'Consult the source.';
  }
  function openComparison() {
    const rows=[...selected].map(id=>resultMap[id]);
    const fields=[
      ['Problem',r=>parameterText(r,r.problem)],
      ['Result type',r=>(r.bound==='upper'?'Algorithm':'Lower bound')+folkloreBadge(r)],
      ['Status',r=>resultBadges(r,true)||'No certificate recorded.'],
      ['Setting',r=>settingSummary(r)],
      ['Guarantee',r=>approxBound(r)],
      ['Round complexity',r=>detailedRoundBound(r)],
      ['Model',r=>modelBadge(r)],
      ['Randomness',r=>esc(r.randomization)],
      ['Parameters',r=>comparisonSetting(r,'parameters')],
      ['Assumptions',r=>comparisonSetting(r,'assumptions')],
      ['Further details',r=>comparisonSetting(r,'detail')],
      ['SOTA frontier',comparisonSota],
      ['Tight bounds',comparisonTight],
      ['Caveats',r=>esc(r.caveat||'No source caveat recorded.')],
      ['Reference',r=>'<a href="'+safeUrl(r.sourceUrl)+'" target="_blank" rel="noopener">'+esc(paperShort(paperMap[r.paperId]))+' ↗</a><span class="cell-secondary">'+esc(r.theorem)+'</span>'+relatedReferences(r)]
    ];
    openDialog('<p class="eyebrow">Read bounds in their full setting</p><h2 id="dialog-title">Compare '+rows.length+' results</h2><p>These results may have different objectives, models and assumptions. No automatic ranking is implied.</p><div class="table-scroll" tabindex="0" role="region" aria-label="Selected result comparison"><table class="compare-table"><caption class="sr-only">Selected result comparison</caption><thead><tr><th>Setting</th>'+rows.map(r=>'<th>'+esc(paperShort(paperMap[r.paperId]))+'</th>').join('')+'</tr></thead><tbody>'+fields.map(([label,fn])=>'<tr><th scope="row">'+label+'</th>'+rows.map(r=>'<td>'+fn(r)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>',true);
  }
  function exportRecord(r) {
    const p=paperMap[r.paperId],match=core.graphMatch(r,state),problem=core.problemMatch(r,state),sota=core.sotaContext(r,resultContext()),point=sota.transfer||sota.annotation,tight=core.tightContext(r,resultContext()),a=core.effectiveApproximation(r,resultContext()),rounds=core.effectiveRounds(r,state);
    return {...r,paperTitle:p.title,authors:p.authors,venue:p.venue,
      queryApproximationDisplay:a.approximationDisplay,queryConstantApproximation:a.constantApproximation,
      queryRoundsDisplay:rounds.roundsDisplay,queryRoundClass:rounds.roundClass,queryRoundComplexityDetails:rounds.roundComplexityDetails,roundSpecialization:rounds.specialization,graphParameterBindings:match.parameterBindings||{},
      querySetting:hasSetting(r)?Object.fromEntries(Object.entries(settingGroups(r)).map(([key,ids])=>[key,ids.map(id=>conditionCatalog()[id].label)])):null,
      queryGraphClass:match.target?.label||'',classTransfer:match.inherited?'inherited':'stated',
      inclusionPath:match.inherited?match.path.nodes.map(id=>core.resolveClass(id).label).join(' ⊆ '):'',
      queryProblem:problem.target?.label||'',problemTransfer:problem.inherited?'inherited':'stated',
      problemReductionPath:problem.inherited?problem.path.nodes.map(id=>core.resolveProblem(id).label).join(' → '):'',
      dominatedBy:r.dominatedBy?.join(' | '),dominanceEvidence:r.frontierComparisons?JSON.stringify(r.frontierComparisons):'',
      sotaQueryStatus:sota.status,sotaScope:point?.scopeLabel,
      sotaAppliesToQuery:core.sotaApplies(r,state),sotaSetting:point?.setting,sotaReason:point?.reason,
      sotaEvidenceUrl:point?.evidenceUrl,sotaChecked:sota.annotation?.checked,
      tightQueryStatus:tight.status,tightAppliesToQuery:tight.status==='tight',
      tightAxes:[...new Set(tight.certificates.map(c=>c.axis))].join(' | '),
      tightScope:tight.certificates.map(c=>c.scopeLabel).join(' | '),
      tightCertificates:JSON.stringify(tight.status==='tight'?tight.certificates:tight.sourceCertificates)};
  }
  function showPaperResults(id) {
    state={...defaults,bibq:state.bibq,explorerBound:state.explorerBound,paper:id};setView('catalog');
  }

  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a');if(!target)return;
    if(target.matches('.skip-link')){event.preventDefault();$('#main').focus({preventScroll:true});$('#main').scrollIntoView?.({block:'start',behavior:'instant'});return;}
    if(target.dataset.classFocus){event.preventDefault();state.classFocus=target.dataset.classFocus;writeLocation();renderClassNetwork();$$('[data-class-focus]').find(el=>el.dataset.classFocus===state.classFocus)?.focus?.({preventScroll:true});return;}
    if(target.dataset.networkFocus){state.classFocus=target.dataset.networkFocus;setView('explorer');$('#class-network-section').scrollIntoView?.({block:'start',behavior:'instant'});if(window.AtlasMathSelect)window.AtlasMathSelect.focus($('#class-focus'));else $('#class-focus').focus({preventScroll:true});return;}
    if(target.dataset.problemFocus){event.preventDefault();state.problemFocus=target.dataset.problemFocus;writeLocation();renderProblemNetwork();$$('[data-problem-focus]').find(el=>el.dataset.problemFocus===state.problemFocus)?.focus?.({preventScroll:true});return;}
    if(target.dataset.problemNetworkFocus){state.problemFocus=target.dataset.problemNetworkFocus;setView('explorer');$('#problem-network-section').scrollIntoView?.({block:'start',behavior:'instant'});$('#problem-focus').focus({preventScroll:true});return;}
    if(target.matches('a[href^="#"]')&&views.includes(target.getAttribute('href').slice(1))){event.preventDefault();setView(target.getAttribute('href').slice(1));return;}
    if(target.dataset.reductionOpen){event.preventDefault();state.reduction=target.dataset.reductionOpen;setView('reductions');$('#reduction-detail').focus({preventScroll:true});$('#reduction-detail').scrollIntoView?.({block:'start',behavior:'instant'});return;}
    if(target.dataset.problem!==undefined)updateFilter('problem',target.dataset.problem);
    if(target.dataset.round!==undefined)updateFilter('round',target.dataset.round);
    if(target.dataset.clear)updateFilter(target.dataset.clear,defaults[target.dataset.clear]);
    if(target.dataset.result)openResult(target.dataset.result);
    const citationId=target.dataset.bib||target.dataset.cite;
    if(citationId&&paperMap[citationId])copy(bibtex(paperMap[citationId]),'BibTeX copied','citation-'+citationId+'.bib');
    if(target.dataset.resultLink){const url=new URL(location.href);url.hash=viewUrl(target.dataset.resultLink);copy(url.href,'Result link copied');}
    if(target.dataset.correction){const r=resultMap[target.dataset.correction];download('correction-'+r.id+'.txt','Correction proposal for '+r.id+'\n\nPaper: '+paperMap[r.paperId].title+'\nSource: '+r.sourceUrl+'\nSource location: '+r.theorem+'\n\nCurrent record:\n'+JSON.stringify(r,null,2)+'\n\nProposed change:\n\nSupporting source / theorem:\n','text/plain');notify('Correction template downloaded');}
    if(target.dataset.matrixProblem){state={...defaults,bibq:state.bibq,explorerBound:state.explorerBound,problem:target.dataset.matrixProblem,round:target.dataset.matrixRound,bound:state.explorerBound};setView('catalog');}
    if(target.dataset.class){state={...defaults,bibq:state.bibq,explorerBound:state.explorerBound,classFocus:target.dataset.class,graph:target.dataset.class,bound:state.explorerBound};setView('catalog');}
    if(target.dataset.problemResults){state={...defaults,bibq:state.bibq,explorerBound:state.explorerBound,problemFocus:target.dataset.problemResults,problem:target.dataset.problemResults,bound:state.explorerBound};setView('catalog');}
    if(target.dataset.paperResults)showPaperResults(target.dataset.paperResults);
  });
  document.addEventListener('change',event=>{
    const el=event.target;
    if(el.dataset.filter)updateFilter(el.dataset.filter,el.type==='checkbox'?el.checked:el.value);
    if(el.dataset.select){
      if(el.checked&&selected.size===4){el.checked=false;notify('Select up to four results to compare.');return;}
      if(el.checked)selected.add(el.dataset.select);else selected.delete(el.dataset.select);
      renderCompareBar();
    }
  });
  $('#search').addEventListener('input',event=>updateFilter('q',event.target.value));
  $('#search-clear').addEventListener('click',()=>{updateFilter('q','');$('#search').focus();});
  $('#filters-toggle').addEventListener('click',()=>{const expanded=$('#filters-toggle').getAttribute('aria-expanded')!=='true';$('#filters-toggle').setAttribute('aria-expanded',String(expanded));$('.filters').dataset.expanded=String(expanded);$('#filters-toggle-label').textContent=expanded?'Hide filters':'Show filters';});
  $('#reset').addEventListener('click',reset);
  $('#empty-reset').addEventListener('click',reset);
  $('#export').addEventListener('click',()=>download('distributed-approximation-results.csv','\uFEFF'+core.csv(visible.map(exportRecord)),'text/csv;charset=utf-8'));
  $('#export-bibtex').addEventListener('click',()=>{
    const ids=[...new Set(visible.map(r=>r.paperId))];
    if(ids.length)download('distributed-approximation-results.bib',ids.map(id=>bibtex(paperMap[id])).join('\n\n')+'\n','application/x-bibtex;charset=utf-8');
  });
  $('#share').addEventListener('click',()=>copy(location.href,'View link copied'));
  $('#bib-search').addEventListener('input',event=>{state.bibq=event.target.value;writeLocation();renderBibliography();});
  $('#bib-export').addEventListener('click',()=>download('distributed-approximation.bib',papers.map(bibtex).join('\n\n'),'text/plain;charset=utf-8'));
  $('#class-focus').addEventListener('change',event=>{state.classFocus=event.target.value;writeLocation();renderClassNetwork();});
  $('#problem-focus').addEventListener('change',event=>{state.problemFocus=event.target.value;writeLocation();renderProblemNetwork();});
  $('#explorer-bound').addEventListener('change',event=>{state.explorerBound=event.target.value;writeLocation();renderExplorer();typeset($('#explorer-view'));});
  $('#compare-open').addEventListener('click',openComparison);
  $('#compare-clear').addEventListener('click',()=>{selected.clear();$$('[data-select]').forEach(el=>el.checked=false);renderCompareBar();});
  $('#dialog-close').addEventListener('click',()=>$('#detail-dialog').close());
  $('#detail-dialog').addEventListener('close',()=>{if(activeResult){activeResult='';writeLocation();}if(dialogOpener?.isConnected&&!dialogOpener.closest('[hidden]'))dialogOpener.focus({preventScroll:true});});
  $('#detail-dialog').addEventListener('click',event=>{if(event.target===$('#detail-dialog')){const box=event.target.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)event.target.close();}});
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.target.closest('[contenteditable="true"]')&&!/input|textarea|select/i.test(event.target.tagName)&&!$('#detail-dialog').open){event.preventDefault();if(state.view!=='catalog')setView('catalog');$('#search').focus();}});
  window.addEventListener('hashchange',()=>{if(location.hash==='#main')return;readLocation();writeLocation();render();if(activeResult)openResult(activeResult);else if($('#detail-dialog').open)$('#detail-dialog').close();});
  window.addEventListener('resize',queueViewportFit);
  window.addEventListener('afterprint',queueViewportFit);
  if(window.ResizeObserver){const viewportObserver=new ResizeObserver(queueViewportFit);for(const selector of ['.site-header','#reference-controls','.filters'])viewportObserver.observe($(selector));}
  const reductionsView=window.AtlasReductionsView.create({core,data:window.ATLAS_DATA,math,typeset,esc,safeUrl,modelBadge,roundBound,approxBound,settingSummary,resultBadges,paperShort,paperMap,getState:()=>state,updateState:patch=>{state={...state,...patch};activeResult='';writeLocation();render();},openResult,showCatalog:patch=>{state={...defaults,...patch,bibq:state.bibq};setView('catalog');},notify});
  initFilters();readLocation();writeLocation();render();if(activeResult)openResult(activeResult);
})();
