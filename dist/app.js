(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = value => { try {const u = new URL(value);return u.protocol === 'https:' ? esc(u.href) : '#';} catch {return '#';} };
  if (!window.ATLAS_DATA || !window.AtlasCore) {
    $('#result-count').textContent = 'The catalog could not load. Rebuild with npm run build, then reload.';
    return;
  }
  const {results, papers, updated} = window.ATLAS_DATA;
  const core = window.AtlasCore;
  const paperMap = Object.fromEntries(papers.map(p => [p.id,p]));
  const resultMap = Object.fromEntries(results.map(r => [r.id,r]));
  const selected = new Set();
  const defaults = {view:'catalog',q:'',problem:'',paper:'',model:'',graph:'',randomization:'',bound:'',round:'',sort:'rounds',transfer:false};
  const views = ['catalog','explorer','bibliography','about'];
  const roundSymbols = {constant:'O(1)',logstar:'O(log* n)',degree:'f(Δ, …)',logarithmic:'O(log n)',polylog:'polylog n',other:'Other'};
  const roundDescriptions = {constant:'Fixed parameters as stated',logstar:'For fixed auxiliary parameters',degree:'Explicit degree or weight dependence',logarithmic:'Including structural parameters',polylog:'Polynomial in log n',other:'Trade-offs and additional regimes'};
  let state = {...defaults};
  let visible = [];
  let toastTimer;
  let activeResult = '';

  function readLocation() {
    const [view, query = ''] = location.hash.slice(1).split('?');
    const params = new URLSearchParams(query);
    state = {...defaults,view:views.includes(view)?view:'catalog'};
    for (const key of Object.keys(defaults)) if (key !== 'view' && params.has(key)) state[key] = key === 'transfer' ? params.get(key) === '1' : params.get(key);
    if (state.round && !core.roundOrder.includes(state.round)) state.round = '';
    if (!['rounds','newest','oldest','problem'].includes(state.sort)) state.sort='rounds';
    activeResult = params.get('result') || '';
  }
  function viewUrl(resultId = '') {
    const params = new URLSearchParams();
    for (const [key,value] of Object.entries(state)) if (key !== 'view' && value !== defaults[key]) params.set(key,typeof value==='boolean'?'1':value);
    if (resultId) params.set('result',resultId);
    return '#'+state.view+(params.size?'?'+params.toString():'');
  }
  function writeLocation() {
    const hash=viewUrl(activeResult);
    if(location.hash===hash)return;
    try {history.replaceState(null,'',hash);}
    catch {location.hash=hash;}
  }
  function setView(view) {state.view=view;activeResult='';writeLocation();render();window.scrollTo({top:0,behavior:'instant'});}
  function updateFilter(key,value) {state[key]=value;activeResult='';writeLocation();render();}
  function reset() {state={...defaults};$('#search').value='';writeLocation();render();}
  function notify(message) {clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3200);}
  async function copy(text,message='Copied to clipboard') {
    try {await navigator.clipboard.writeText(text);notify(message);}
    catch {download('atlas-link.txt',text,'text/plain');notify('Clipboard unavailable. Downloaded a text file instead.');}
  }
  function download(name,content,type) {
    const url = URL.createObjectURL(new Blob([content],{type}));
    const a = document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function paperShort(p) {
    const names = p.authors.split(/;|\s+and\s+/).map(x=>x.trim()).filter(Boolean);
    const surname = names[0]?.split(' ').at(-1) || p.id;
    return (names.length>1?surname+' et al.':surname)+' · '+p.year;
  }
  function isPreprint(p) {return /arxiv|corr|preprint/i.test(p.venue);}
  function bibtex(p) {
    const tex = text => String(text).replace(/[{}]/g,'').replace(/&/g,'\\&').replace(/%/g,'\\%');
    const authors = p.authors.replace(/;\s*/g,' and ');
    return '@misc{'+p.id+',\n  title = {'+tex(p.title)+'},\n  author = {'+tex(authors)+'},\n  year = {'+p.year+'},\n  howpublished = {'+tex(p.venue)+'},\n  url = {'+p.url+'}'+(p.doi?',\n  doi = {'+p.doi+'}':'')+'\n}';
  }
  function modelBadge(r) {return '<span class="model-badge '+r.model.toLowerCase()+'">'+esc(r.model)+'</span>';}
  function convention(r) {
    if (r.bound==='lower') return 'Impossibility statement. Read the exact guarantee and quantifiers below.';
    if (r.objective==='min') return 'Minimization: solution cost ≤ factor × OPT.';
    if (/fraction|1\s*[−–-]\s*|≥|at least|1\//i.test(r.approximation)) return 'Maximization: the stated fraction of OPT is retained; see the assumptions.';
    return 'Maximization: for a ratio ≥ 1, solution value ≥ OPT / ratio. See the assumptions for other conventions.';
  }

  function initFilters() {
    const problems = [...new Set(results.map(r=>r.problem))].sort();
    $('#problem-filters').innerHTML=['',...problems].map(p=>'<button type="button" data-problem="'+esc(p)+'" aria-pressed="false">'+esc(p||'All problems')+'<span>'+results.filter(r=>!p||r.problem===p).length+'</span></button>').join('');
    const tags=[...new Set(results.flatMap(r=>core.graphTags(r.graphClass)))].sort();
    $('#graph').insertAdjacentHTML('beforeend',tags.map(t=>'<option>'+esc(t)+'</option>').join(''));
    $('#round-filters').innerHTML=[['','All rounds'],['constant','<span class="round-math">O(1)</span>'],['logstar','<span class="round-math">O(log* n)</span>'],['degree','Degree dependent'],['logarithmic','<span class="round-math">O(log n)</span>'],['polylog','Polylog n'],['other','Other']].map(([key,label])=>'<button data-round="'+key+'" aria-pressed="false">'+label+'</button>').join('');
    const fast=results.filter(r=>['constant','logstar'].includes(r.roundClass)).length;
    $('#catalog-stats').innerHTML='<span><strong>'+results.length+'</strong> bounds</span><span><strong>'+papers.length+'</strong> paper records</span><span><strong>'+problems.length+'</strong> problems</span><span><strong>'+fast+'</strong> constant / log* n</span>';
  }

  function resultRow(r) {
    const p=paperMap[r.paperId];
    return '<tr class="result-row"><td class="select-cell"><input type="checkbox" data-select="'+esc(r.id)+'" '+(selected.has(r.id)?'checked':'')+' aria-label="Compare '+esc(r.problem+', '+r.approximation+', '+paperShort(p))+'"></td><td><button class="problem-button" data-result="'+esc(r.id)+'">'+esc(r.problem)+'</button><span class="cell-secondary">'+esc(r.graphClass)+'</span>'+(r.variant&&r.variant!=='Unweighted'?'<span class="cell-secondary">'+esc(r.variant)+'</span>':'')+'</td><td class="approx-cell">'+(r.bound==='lower'?'<span class="lower-badge">Lower bound</span><br>':'')+'<span class="math">'+esc(r.approximation)+'</span></td><td class="round-cell"><span class="math">'+esc(r.rounds)+'</span></td><td>'+modelBadge(r)+'<span class="type-text">'+esc(r.randomization)+'</span></td><td><button class="reference-button" data-result="'+esc(r.id)+'">'+esc(paperShort(p))+'</button>'+(isPreprint(p)?'<span class="preprint-mark">Preprint</span>':'')+(r.caveat?'<span class="caveat-badge">Source caveat</span>':'')+'</td><td><button class="detail-arrow" data-result="'+esc(r.id)+'" aria-label="Details for '+esc(r.problem+', '+r.id)+'">↗</button></td></tr>';
  }
  function renderCatalog() {
    visible=core.filtered(results,paperMap,state);
    $('#search').value=state.q;
    $$('[data-filter]').forEach(el=>{if(el.type==='checkbox')el.checked=state[el.dataset.filter];else el.value=state[el.dataset.filter];});
    $$('[data-problem]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.problem===state.problem)));
    $$('[data-round]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.round===state.round)));
    const lower=visible.filter(r=>r.bound==='lower').length;
    $('#result-count').innerHTML='<strong>'+visible.length+'</strong> of '+results.length+' bounds'+(lower?' <span>· '+lower+' lower</span>':'');
    const tags=['problem','paper','model','graph','randomization','bound','round'].filter(key=>state[key]);
    $('#active-filters').innerHTML=tags.map(key=>'<button data-clear="'+key+'" aria-label="Clear '+esc(key)+' filter">'+esc(key==='round'?core.roundLabels[state[key]]:key==='paper'?(paperMap[state[key]]?paperShort(paperMap[state[key]]):state[key]):key==='bound'?(state.bound==='upper'?'Algorithms':'Lower bounds'):state[key])+' ×</button>').join('');
    let previous='';
    $('#results-body').innerHTML=visible.map(r=>{
      let heading='';
      if(state.sort==='rounds'&&r.roundClass!==previous){previous=r.roundClass;heading='<tr class="group-row"><th colspan="7"><span class="group-symbol">'+roundSymbols[r.roundClass]+'</span><span class="group-title">'+core.roundLabels[r.roundClass]+'</span><span class="group-meta">'+visible.filter(x=>x.roundClass===r.roundClass).length+' results · '+roundDescriptions[r.roundClass]+'</span></th></tr>';}
      return heading+resultRow(r);
    }).join('');
    $('#empty').hidden=visible.length>0;
    $('.table-scroll').hidden=visible.length===0;
    $('#export').disabled=visible.length===0;
    renderCompareBar();
  }
  function renderCompareBar() {
    $('#compare-bar').hidden=selected.size===0;
    $('#compare-count').textContent=selected.size+' of 4 selected';
    $('#compare-open').disabled=selected.size<2;
  }

  function renderExplorer() {
    const bound=$('#explorer-bound').value;
    const subset=results.filter(r=>!bound||r.bound===bound);
    const problems=[...new Set(results.map(r=>r.problem))].sort();
    const counts=problems.map(p=>core.roundOrder.map(round=>subset.filter(r=>r.problem===p&&r.roundClass===round).length));
    const max=Math.max(1,...counts.flat());
    $('#matrix').innerHTML='<table class="matrix"><caption class="sr-only">Number of results by problem and round regime</caption><thead><tr><th>Problem</th>'+core.roundOrder.map(key=>'<th>'+roundSymbols[key]+'</th>').join('')+'</tr></thead><tbody>'+problems.map((p,i)=>'<tr><th scope="row">'+esc(p)+'</th>'+counts[i].map((count,j)=>'<td>'+(count?'<button data-matrix-problem="'+esc(p)+'" data-matrix-round="'+core.roundOrder[j]+'" style="--heat:'+(6+Math.round(count/max*21))+'%" aria-label="'+count+' '+esc(p)+' results, '+core.roundLabels[core.roundOrder[j]]+'">'+count+'</button>':'<span class="zero" aria-label="No cataloged results">—</span>')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
    const countClass=tag=>results.filter(r=>core.graphTags(r.graphClass).includes(tag)).length;
    const chain=['Outerplanar','Planar','Bounded genus','Minor-free','Bounded expansion','Bounded arboricity'];
    $('#class-chain').innerHTML=chain.map((name,i)=>(i?'<span class="inclusion" aria-label="is a subclass of">⊆</span>':'')+'<button class="class-node" data-class="'+esc(name)+'">'+esc(name)+'<small>'+countClass(name)+' recorded bounds</small></button>').join('');
    const others=['General graphs','Bounded degree','Trees / forests','Unit-disk','Bounded growth / independence','Bipartite / colored'];
    const graph='<svg viewBox="0 0 50 45" aria-hidden="true"><path d="M8 30 16 10 38 12 42 35 8 30 38 12M16 10 42 35"/><circle cx="8" cy="30" r="3"/><circle cx="16" cy="10" r="3"/><circle cx="38" cy="12" r="3"/><circle cx="42" cy="35" r="3"/></svg>';
    $('#class-cards').innerHTML=others.map(name=>'<button class="class-card" data-class="'+esc(name)+'">'+graph+'<span>'+esc(name)+'<small>'+countClass(name)+' recorded bounds</small></span></button>').join('');
  }
  function renderBibliography() {
    const query=core.normalize($('#bib-search').value);
    const rows=papers.filter(p=>query.split(/\s+/).filter(Boolean).every(term=>core.normalize(p.title+' '+p.authors+' '+p.venue+' '+p.year).includes(term))).sort((a,b)=>b.year-a.year||a.title.localeCompare(b.title));
    $('#bibliography-count').textContent=rows.length+' of '+papers.length+' paper records · conference, journal and preprint versions';
    let year=0;
    $('#bibliography-list').innerHTML=rows.map(p=>{
      const heading=p.year!==year?'<h3 class="bibliography-year">'+p.year+'</h3>':'';year=p.year;
      const count=results.filter(r=>r.paperId===p.id).length;
      return heading+'<article class="paper-entry '+(isPreprint(p)?'preprint':'')+'"><h3><a href="'+safeUrl(p.url)+'" target="_blank" rel="noopener">'+esc(p.title)+' ↗</a></h3><p>'+esc(p.authors)+'</p><p class="paper-meta">'+esc(p.venue)+' · '+p.year+(p.surveySection?' · Feuilloley bibliography §'+p.surveySection:'')+'</p>'+(p.notes?'<p class="paper-meta">'+esc(p.notes)+'</p>':'')+'<div class="paper-actions">'+(count?'<button class="text-button" data-paper-results="'+esc(p.id)+'">'+count+' recorded '+(count===1?'bound':'bounds')+' →</button>':'<span class="hint">Bibliography only · see note</span>')+'<button class="text-button" data-bib="'+esc(p.id)+'">Copy BibTeX</button><a href="'+safeUrl(p.url)+'" target="_blank" rel="noopener">Read paper ↗</a></div></article>';
    }).join('')||'<div class="empty"><h3>No matching papers</h3><p>Try an author name or a shorter title.</p></div>';
  }
  function render() {
    views.forEach(view=>$('#'+view+'-view').hidden=state.view!==view);
    $$('[data-view]').forEach(el=>{if(el.dataset.view===state.view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    if(state.view==='catalog')renderCatalog();
    if(state.view==='explorer')renderExplorer();
    if(state.view==='bibliography')renderBibliography();
  }

  function openDialog(content,comparison=false) {
    const dialog=$('#detail-dialog');dialog.classList.toggle('compare-dialog',comparison);
    $('#dialog-content').innerHTML=content;
    if(!dialog.open)dialog.showModal();
    dialog.scrollTop=0;
  }
  function openResult(id) {
    const r=resultMap[id];if(!r)return;
    const p=paperMap[r.paperId];activeResult=id;writeLocation();
    openDialog('<div class="dialog-eyebrow">'+modelBadge(r)+'<span>'+esc(r.randomization)+'</span><span>·</span><span>'+r.year+'</span>'+(r.bound==='lower'?'<span class="lower-badge">Lower bound</span>':'')+'</div><h2 id="dialog-title">'+esc(r.problem)+'</h2><div class="dialog-subtitle">'+esc(r.variant)+' · '+esc(r.graphClass)+'</div>'+(r.caveat?'<div class="source-caveat"><strong>Source caveat</strong><p>'+esc(r.caveat)+'</p>'+(r.caveatUrl?'<a href="'+safeUrl(r.caveatUrl)+'" target="_blank" rel="noopener">Read the later discussion ↗</a>':'')+'</div>':'')+'<div class="detail-metrics"><div class="metric"><span>'+(r.bound==='upper'?'Approximation guarantee':'Excluded / necessary guarantee')+'</span><div class="math">'+esc(r.approximation)+'</div><p>'+esc(convention(r))+'</p></div><div class="metric"><span>Communication rounds</span><div class="math">'+esc(r.rounds)+'</div><p>'+esc(r.parameters)+'</p></div></div><p>'+esc(r.summary)+'</p><section class="detail-section"><h3>Setting & assumptions</h3><dl class="detail-definition"><dt>Graph class</dt><dd>'+esc(r.graphClass)+'</dd><dt>Model</dt><dd>'+esc(r.model)+'</dd><dt>Randomness</dt><dd>'+esc(r.randomization)+'</dd><dt>Fixed parameters</dt><dd>'+esc(r.parameters||'See source.')+'</dd><dt>Additional conditions</dt><dd>'+esc(r.assumptions||'No additional conditions transcribed; consult the source for full theorem details.')+'</dd></dl></section><section class="detail-section"><h3>Source</h3><p class="citation"><a href="'+safeUrl(p.url)+'" target="_blank" rel="noopener"><strong>'+esc(p.title)+' ↗</strong></a><br>'+esc(p.authors)+'<br>'+esc(p.venue)+' · '+p.year+'</p>'+(p.notes?'<p class="hint">'+esc(p.notes)+'</p>':'')+'<a class="text-button" href="'+safeUrl(r.sourceUrl)+'" target="_blank" rel="noopener">Source location: '+esc(r.theorem)+' ↗</a><div class="source-note">'+(r.verification==='primary'?'Primary source checked':'Transcribed from secondary bibliography')+' · '+esc(r.theorem)+'. '+(isPreprint(p)?'This record cites a preprint. ':'')+'Check means the claim was located in the source; it is not an independent proof review.</div></section><div class="dialog-actions"><a class="button" href="'+safeUrl(r.sourceUrl)+'" target="_blank" rel="noopener">Read source ↗</a><button class="button subtle" data-bib="'+esc(p.id)+'">Copy BibTeX</button><button class="button subtle" data-result-link="'+esc(r.id)+'">Copy result link</button><button class="text-button" data-correction="'+esc(r.id)+'">Download correction template ↓</button></div>');
  }
  function openComparison() {
    const rows=[...selected].map(id=>resultMap[id]);
    const fields=[['Problem',r=>esc(r.problem)+'<span class="cell-secondary">'+esc(r.variant)+'</span>'],['Result type',r=>r.bound==='upper'?'Algorithm':'Lower bound'],['Guarantee',r=>'<span class="math">'+esc(r.approximation)+'</span><span class="cell-secondary">'+esc(convention(r))+'</span>'],['Rounds',r=>'<span class="math">'+esc(r.rounds)+'</span>'],['Graph class',r=>esc(r.graphClass)],['Model',r=>modelBadge(r)],['Randomness',r=>esc(r.randomization)],['Parameters',r=>esc(r.parameters)],['Assumptions',r=>esc(r.assumptions||'Consult the source.')],['Caveats',r=>esc(r.caveat||'No source caveat recorded.')],['Reference',r=>'<a href="'+safeUrl(r.sourceUrl)+'" target="_blank" rel="noopener">'+esc(paperShort(paperMap[r.paperId]))+' ↗</a><span class="cell-secondary">'+esc(r.theorem)+'</span>']];
    openDialog('<p class="eyebrow">Read bounds in their full setting</p><h2 id="dialog-title">Compare '+rows.length+' results</h2><p>These results may have different objectives, models and assumptions. No automatic ranking is implied.</p><div class="table-scroll"><table class="compare-table"><caption class="sr-only">Selected result comparison</caption><thead><tr><th>Setting</th>'+rows.map(r=>'<th>'+esc(paperShort(paperMap[r.paperId]))+'</th>').join('')+'</tr></thead><tbody>'+fields.map(([label,fn])=>'<tr><th scope="row">'+label+'</th>'+rows.map(r=>'<td>'+fn(r)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>',true);
  }
  function showPaperResults(id) {
    state={...defaults,paper:id};setView('catalog');
  }

  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a');if(!target)return;
    if(target.matches('a[href^="#"]')&&views.includes(target.getAttribute('href').slice(1))){event.preventDefault();setView(target.getAttribute('href').slice(1));return;}
    if(target.dataset.problem!==undefined)updateFilter('problem',target.dataset.problem);
    if(target.dataset.round!==undefined)updateFilter('round',target.dataset.round);
    if(target.dataset.clear)updateFilter(target.dataset.clear,'');
    if(target.dataset.result)openResult(target.dataset.result);
    if(target.dataset.bib)copy(bibtex(paperMap[target.dataset.bib]),'BibTeX copied');
    if(target.dataset.resultLink){const url=new URL(location.href);url.hash=viewUrl(target.dataset.resultLink);copy(url.href,'Result link copied');}
    if(target.dataset.correction){const r=resultMap[target.dataset.correction];download('correction-'+r.id+'.txt','Correction proposal for '+r.id+'\n\nPaper: '+paperMap[r.paperId].title+'\nSource: '+r.sourceUrl+'\nSource location: '+r.theorem+'\n\nCurrent record:\n'+JSON.stringify(r,null,2)+'\n\nProposed change:\n\nSupporting source / theorem:\n','text/plain');notify('Correction template downloaded');}
    if(target.dataset.matrixProblem){state={...defaults,problem:target.dataset.matrixProblem,round:target.dataset.matrixRound,bound:$('#explorer-bound').value};setView('catalog');}
    if(target.dataset.class){state={...defaults,graph:target.dataset.class};setView('catalog');}
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
  $('#reset').addEventListener('click',reset);
  $('#empty-reset').addEventListener('click',reset);
  $('#export').addEventListener('click',()=>download('distributed-approximation-results.csv','\uFEFF'+core.csv(visible.map(r=>({...r,paperTitle:paperMap[r.paperId].title,authors:paperMap[r.paperId].authors,venue:paperMap[r.paperId].venue}))),'text/csv;charset=utf-8'));
  $('#share').addEventListener('click',()=>copy(location.href,'View link copied'));
  $('#bib-search').addEventListener('input',renderBibliography);
  $('#bib-export').addEventListener('click',()=>download('distributed-approximation.bib',papers.map(bibtex).join('\n\n'),'text/plain;charset=utf-8'));
  $('#explorer-bound').addEventListener('change',renderExplorer);
  $('#compare-open').addEventListener('click',openComparison);
  $('#compare-clear').addEventListener('click',()=>{selected.clear();$$('[data-select]').forEach(el=>el.checked=false);renderCompareBar();});
  $('#dialog-close').addEventListener('click',()=>$('#detail-dialog').close());
  $('#detail-dialog').addEventListener('close',()=>{activeResult='';writeLocation();});
  $('#detail-dialog').addEventListener('click',event=>{if(event.target===$('#detail-dialog')){const box=event.target.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)event.target.close();}});
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!/input|textarea|select/i.test(event.target.tagName)&&!$('#detail-dialog').open){event.preventDefault();if(state.view!=='catalog')setView('catalog');$('#search').focus();}});
  window.addEventListener('hashchange',()=>{if(location.hash==='#main')return;readLocation();render();if(activeResult)openResult(activeResult);else if($('#detail-dialog').open)$('#detail-dialog').close();});
  initFilters();readLocation();render();if(activeResult)openResult(activeResult);
})();
