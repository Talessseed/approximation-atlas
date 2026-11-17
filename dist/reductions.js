/* Static reduction reference: instances, guarantees, costs, and certified applications. */
(() => {
  'use strict';
  function create(options) {
    const {core,data,math,typeset,esc,safeUrl,modelBadge,roundBound,approxBound,settingSummary,resultBadges,paperShort,paperMap,getState,updateState,openResult,showCatalog}=options;
    const graphText=value=>window.AtlasMath?.text(value,[],false)??esc(value);
    const $=selector=>document.querySelector(selector);
    const entries=data.reductions?.entries||[];
    const byId=Object.fromEntries(entries.map(r=>[r.id,r]));
    const results=Object.fromEntries((data.results||[]).map(r=>[r.id,r]));
    const statusLabels={automatic:'Certified specialization',conditional:'Check the instance',relaxation:'LP relaxation'};
    const statusOrder={automatic:0,conditional:1,relaxation:2};
    const problem=id=>core.resolveProblem(id)||{id,label:id,description:''};
    const formula=(value,className='math',definitions=[])=>value?math(value,className,undefined,definitions):'<span class="hint">Not specified</span>';
    function instanceParameter(symbol,value,definitions=[]) {
      const label=symbol+' = '+value,tex=data.notation?.[value];
      return math(label,'math',tex?(symbol==='n′'?"n'":"\\Delta'")+'='+tex:undefined,definitions);
    }
    let controlsReady=false;

    function filtered(state) {
      if(core.filteredReductions)return core.filteredReductions(state);
      const focus=core.resolveProblem(state.reductionProblem)?.id;
      return entries.filter(r=>
        (!focus||r.from===focus||r.to===focus)&&
        (!state.reductionModel||r.models.includes(state.reductionModel))&&
        (!state.reductionKind||r.status===state.reductionKind||r.kind===state.reductionKind)&&
        core.searchMatches([problem(r.from).label,problem(r.to).label,r.title,r.summary,r.runtime,r.guarantee,r.instance.description,r.source.title,...r.conditions].join(' '),state.reductionQ||'')
      ).sort((a,b)=>(statusOrder[a.status]??3)-(statusOrder[b.status]??3)||core.compareProblems(problem(a.from).label,problem(b.from).label)||core.compareProblems(problem(a.to).label,problem(b.to).label)||core.compareText(a.title,b.title));
    }

    function ensureControls() {
      if(controlsReady)return;
      const ids=[...new Set(entries.flatMap(r=>[r.from,r.to]))].sort((a,b)=>core.compareProblems(problem(a).label,problem(b).label));
      const models=[...new Set(entries.flatMap(r=>r.models))].sort((a,b)=>['LOCAL','CONGEST','Anonymous','SUPPORTED'].indexOf(a)-['LOCAL','CONGEST','Anonymous','SUPPORTED'].indexOf(b));
      $('#reductions-controls').innerHTML=
        '<div class="reduction-filter-grid">'+
          '<label for="reduction-problem">Problem<select id="reduction-problem"><option value="">All problems</option>'+ids.map(id=>'<option value="'+esc(id)+'">'+esc(problem(id).label)+'</option>').join('')+'</select></label>'+
          '<label for="reduction-model">Model<select id="reduction-model"><option value="">All models</option>'+models.map(model=>'<option>'+esc(model)+'</option>').join('')+'</select></label>'+
          '<label for="reduction-kind">Transfer status<select id="reduction-kind"><option value="">All reductions</option><option value="automatic">Certified specializations</option><option value="conditional">Check the instance</option><option value="relaxation">LP relaxations</option></select></label>'+
          '<label for="reduction-bound">Use for<select id="reduction-bound"><option value="upper">Algorithms</option><option value="lower">Lower bounds</option><option value="">Both directions</option></select></label>'+
        '</div><div class="reduction-search-row"><label class="search-box" for="reduction-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input id="reduction-search" type="search" placeholder="Search reductions, techniques, instances…" autocomplete="off" spellcheck="false"></label><button id="reduction-reset" class="text-button" type="button" data-reduction-reset>Reset reductions</button></div>';
      controlsReady=true;
    }

    function sourceLabel(source) {
      const label=source.short||source.label||source.title;
      return label.length>64?label.slice(0,61)+'…':label;
    }
    function sourceLink(source,short=false) {
      return '<a href="'+safeUrl(source.url)+'" target="_blank" rel="noopener" title="'+esc(source.title)+'">'+esc(short?sourceLabel(source):source.title)+' ↗</a>';
    }
    function modelList(r) {return '<div class="reduction-model-list">'+r.models.map(model=>modelBadge({model})).join('')+'</div>';}
    function statusBadge(r) {return '<span class="reduction-status '+esc(r.status)+'">'+esc(statusLabels[r.status]||r.status)+'</span>';}
    function wrap(label,max=25) {
      const lines=[''];
      for(const word of label.split(' ')) {
        const i=lines.length-1;
        if((lines[i]+' '+word).trim().length>max&&lines[i])lines.push(word);else lines[i]+=(lines[i]?' ':'')+word;
      }
      return lines;
    }

    function mapLayout(rows) {
      const ids=[...new Set(rows.flatMap(r=>[r.from,r.to]))];
      // Relaxations can point back toward an algorithm used for rounding. They do not
      // determine the algorithmic layers, but all arrows remain visible.
      const edges=rows.filter(r=>r.kind!=='relaxation'&&r.status!=='relaxation');
      const incoming=Object.fromEntries(ids.map(id=>[id,0]));
      for(const r of edges)if(r.from!==r.to)incoming[r.to]++;
      const queue=ids.filter(id=>incoming[id]===0).sort((a,b)=>core.compareProblems(problem(a).label,problem(b).label));
      const ranks=Object.fromEntries(ids.map(id=>[id,0])),visited=new Set();
      while(queue.length) {
        const id=queue.shift();visited.add(id);
        for(const edge of edges.filter(r=>r.from===id&&r.to!==id)) {
          ranks[edge.to]=Math.max(ranks[edge.to],ranks[id]+1);
          if(--incoming[edge.to]===0)queue.push(edge.to);
        }
      }
      // A catalog may later contain equivalent formulations in both directions.
      // Keep those nodes in a finite layer instead of attempting to unfold a cycle.
      for(const id of ids)if(!visited.has(id))ranks[id]=1;
      const columns=[...new Set(Object.values(ranks))].sort((a,b)=>a-b);
      const groups=columns.map(rank=>ids.filter(id=>ranks[id]===rank));
      const height=Math.max(270,Math.max(...groups.map(g=>g.length),1)*74+56);
      const width=Math.max(800,groups.length*285+40),boxWidth=235,boxHeight=48;
      const positions={};
      groups.forEach((group,col)=>{
        group.sort((a,b)=>{
          const centre=id=>{
            const previous=edges.filter(r=>r.to===id&&positions[r.from]).map(r=>positions[r.from].y);
            return previous.length?previous.reduce((s,y)=>s+y,0)/previous.length:height/2;
          };
          return centre(a)-centre(b)||core.compareProblems(problem(a).label,problem(b).label);
        });
        group.forEach((id,i)=>{
          positions[id]={x:30+col*(width-60-boxWidth)/Math.max(1,groups.length-1),y:50+(i+.5)*(height-72)/group.length-boxHeight/2};
        });
      });
      return {positions,width,height,boxWidth,boxHeight};
    }

    function renderMap(rows,selected) {
      const container=$('#reduction-map');
      if(!rows.length){container.innerHTML='';return;}
      const {positions,width,height,boxWidth:w,boxHeight:h}=mapLayout(rows);
      const pairCounts=new Map(),pairIndices=new Map();
      for(const r of rows){const key=r.from+'>'+r.to;pairCounts.set(key,(pairCounts.get(key)||0)+1);}
      const arrows=[...rows].sort((a,b)=>Number(a.id===selected?.id)-Number(b.id===selected?.id)).map(r=>{
        const from=positions[r.from],to=positions[r.to],key=r.from+'>'+r.to;
        const i=pairIndices.get(key)||0;pairIndices.set(key,i+1);
        const shift=(i-(pairCounts.get(key)-1)/2)*12;
        const forward=to.x>from.x,same=to.x===from.x;
        let sx=forward?from.x+w:from.x,ex=forward?to.x:to.x+w;
        const sy=from.y+h/2+shift,ey=to.y+h/2+shift;
        let path;
        if(same){sx=from.x+w;ex=to.x+w;const bend=sx+38+i*10;path='M'+sx+' '+sy+' C'+bend+' '+sy+' '+bend+' '+ey+' '+ex+' '+ey;}
        else {const cx=(sx+ex)/2;path='M'+sx+' '+sy+' C'+cx+' '+sy+' '+cx+' '+ey+' '+ex+' '+ey;}
        const active=r.id===selected?.id;
        const graph=r.instance.graph,showLabel=graph!=='G'&&(active||rows.length<=5),label=graph.startsWith('Inc')?'I(G)':graph;
        return '<a href="#reductions?reduction='+encodeURIComponent(r.id)+'" class="reduction-map-edge '+esc(r.status)+(active?' is-selected':'')+'" data-reduction-select="'+esc(r.id)+'" aria-label="'+esc(problem(r.from).label+' uses '+problem(r.to).label+': '+r.title)+'"'+(active?' aria-current="true"':'')+'><title>'+esc(r.title+' · '+graph+' · '+r.runtime+' · '+statusLabels[r.status])+'</title><path class="reduction-edge-hit" d="'+path+'"/><path class="reduction-edge-shaft" d="'+path+'" marker-end="url(#recipe-arrow-'+esc(r.status)+')"/>'+(showLabel?'<text class="reduction-map-label" x="'+((sx+ex)/2)+'" y="'+((sy+ey)/2-7)+'" text-anchor="middle">'+esc(label)+'</text>':'')+'</a>';
      }).join('');
      const nodes=Object.entries(positions).map(([id,pos])=>{
        const lines=wrap(problem(id).label),active=selected&&(selected.from===id||selected.to===id);
        return '<a href="#reductions?reductionProblem='+encodeURIComponent(id)+'" data-reduction-problem="'+esc(id)+'" class="reduction-map-node'+(active?' is-selected':'')+'" aria-label="'+esc('Show reductions involving '+problem(id).label)+'"><g transform="translate('+pos.x+' '+pos.y+')"><title>'+esc(problem(id).description)+'</title><rect width="'+w+'" height="'+h+'" rx="5"/>'+lines.map((line,i)=>'<text x="'+(w/2)+'" y="'+(28-(lines.length-1)*7+i*14)+'" text-anchor="middle">'+esc(line)+'</text>').join('')+'</g></a>';
      }).join('');
      container.innerHTML='<div class="reduction-map-scroll" tabindex="0" role="region" aria-label="Interactive reduction map; scroll to see connected problems"><svg class="reduction-overview" viewBox="0 0 '+width+' '+height+'" role="group" aria-label="Arrows lead from the problem being solved to its algorithm"><defs>'+['automatic','conditional','relaxation'].map(kind=>'<marker id="recipe-arrow-'+kind+'" class="'+kind+'" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10z"/></marker>').join('')+'</defs>'+arrows+nodes+'</svg></div><div class="reduction-map-legend"><span><i class="automatic" aria-hidden="true"></i>Certified specialization</span><span><i class="conditional" aria-hidden="true"></i>Check the instance</span><span><i class="relaxation" aria-hidden="true"></i>LP relaxation</span></div><p class="hint">Select an arrow for its recipe, or a problem to focus the map. I(G) labels an incidence instance described in the table. Scroll within the map if needed.</p>';
    }

    function renderRows(rows,selected) {
      $('#reductions-body').innerHTML=rows.map(r=>'<tr id="reduction-row-'+esc(r.id)+'" class="reduction-row'+(r.id===selected?.id?' is-selected':'')+'">'+
        '<th scope="row"><button class="reduction-problem-button" data-reduction-problem="'+esc(r.from)+'">'+esc(problem(r.from).label)+'</button></th>'+
        '<td><button class="reduction-problem-button" data-reduction-problem="'+esc(r.to)+'">'+esc(problem(r.to).label)+'</button></td>'+
        '<td class="reduction-runtime-cell">'+formula(r.runtime,'math',r.parameterDefinitions)+'</td>'+
        '<td class="reduction-guarantee-cell">'+formula(r.guarantee,'math',r.parameterDefinitions)+'</td>'+
        '<td class="reduction-instance-cell">'+formula(r.instance.graph,'math',r.parameterDefinitions)+'<span class="reduction-instance-parameter">'+instanceParameter('n′',r.instance.vertices,r.parameterDefinitions)+'</span><span class="reduction-instance-parameter">'+instanceParameter('Δ′',r.instance.degree,r.parameterDefinitions)+'</span></td>'+
        '<td>'+modelList(r)+'</td>'+
        '<td class="reduction-source-cell">'+sourceLink(r.source,true)+'<span class="cell-secondary">'+esc(r.source.location||'')+'</span></td>'+
        '<td><button class="text-button reduction-technique" data-reduction-select="'+esc(r.id)+'" aria-expanded="'+(r.id===selected?.id)+'" aria-controls="reduction-detail">'+esc(r.title)+' ↓</button>'+statusBadge(r)+'</td></tr>').join('');
    }

    function applications(r,state) {
      const directions=state.reductionBound?[state.reductionBound]:['upper','lower'];
      const list=core.reductionApplications?directions.flatMap(bound=>core.reductionApplications(r,{bound,model:state.reductionModel})):[];
      if(r.status==='relaxation')return '<p class="reduction-application-note">The relaxed output is fractional. An integral approximation requires a separate rounding argument.</p>';
      const actions=[];
      if(state.reductionBound!=='lower'&&r.engine?.upper)actions.push('<button class="button subtle" data-reduction-catalog="upper">View '+esc(problem(r.from).label)+' algorithms →</button>');
      if(state.reductionBound!=='upper'&&r.engine?.lower)actions.push('<button class="button subtle" data-reduction-catalog="lower">View '+esc(problem(r.to).label)+' lower bounds →</button>');
      const intro=r.kind==='approximation'?(state.reductionBound==='lower'?'This rule certifies algorithms only; no lower-bound transfer is inferred.':'Use an algorithm for '+esc(problem(r.to).label.toLowerCase())+' to approximate '+esc(problem(r.from).label.toLowerCase())+', with the guarantee and round complexity shown above.'):state.reductionBound==='lower'?'Hardness of the special case gives hardness of the general formulation.':state.reductionBound==='upper'?'An algorithm for the general formulation supplies an algorithm for the special case.':'An algorithm for the general problem solves the special case; lower bounds apply in the reverse direction.';
      let html='<p class="reduction-application-note">'+intro+' The engine evaluates each algorithm on the transformed instance, applies its communication cost and checks the rule’s graph and model conditions. Open a computed bound for its complete chain.</p><div class="reduction-catalog-actions">'+actions.join('')+'</div>';
      if(!list.length)return html+'<p class="hint">No compatible source bound currently satisfies this rule for the selected direction and model. The construction and conditions above remain available for manual use.</p>';
      html+='<details class="reduction-applications" open><summary>'+list.length+' computed '+(state.reductionBound==='lower'?'lower-bound transfers':'applications in the catalog')+'</summary><div class="table-scroll" tabindex="0" role="region" aria-label="Bounds obtained with this reduction"><table id="reduction-applications"><caption class="sr-only">Computed applications of '+esc(r.title)+'</caption><thead><tr><th scope="col">Computed bound / direction</th><th scope="col">Guarantee</th><th scope="col">Resulting rounds</th><th scope="col">Model / graph class</th><th scope="col">Algorithm and chain</th></tr></thead><tbody>';
      html+=list.map(a=>{
        const parent=a.result,source=a.sourceResult||parent,derived=a.derivedResult||parent,paper=paperMap[source.paperId];
        const solves=typeof a.solves==='string'?problem(a.solves):a.solves||problem(derived.bound==='lower'?r.to:r.from);
        const steps=derived.reductionPath||[r.id],first=derived.reductionSteps?.[0];
        const conversion=a.conversion||r.runtime;
        const instance=first&&Object.keys(first.substitutions||{}).length?'<span class="reduction-instance-substitutions">'+Object.entries(first.substitutions).map(([key,value])=>formula(key,'math',derived.parameterDefinitions)+' = '+formula(value,'math',derived.parameterDefinitions)).join('; ')+'</span>':'';
        const parentLink=parent.id!==source.id?'<button class="reference-button reduction-parent-link" data-reduction-derived="'+esc(parent.id)+'">Algorithm used in this step: '+esc(parent.problem)+' →</button>':'';
        return '<tr class="reduction-application-row" data-derived-result="'+esc(derived.id)+'"><th scope="row"><button class="reduction-problem-button" data-reduction-derived="'+esc(derived.id)+'">'+esc(solves.label||solves.id)+' ↗</button><span class="cell-secondary">'+(derived.bound==='lower'?'Lower bound':'Algorithm')+' · '+steps.length+' '+(steps.length===1?'reduction step':'reduction steps')+'</span></th><td class="reduction-derived-guarantee">'+approxBound(derived)+'</td><td class="reduction-application-rounds"><span class="reduction-derived-rounds">'+roundBound(derived)+'</span><span class="reduction-application-conversion reduction-conversion">'+formula(conversion,'math',r.parameterDefinitions)+'<span class="cell-secondary">Round complexity before conversion:</span><span class="reduction-source-rounds">'+roundBound(parent)+'</span>'+instance+'</span></td><td>'+modelBadge(derived)+'<span class="cell-secondary">'+esc(derived.randomization)+'</span><span class="cell-secondary result-setting">'+(settingSummary?settingSummary(derived):esc(derived.graphClass))+'</span>'+(resultBadges?resultBadges(derived):'')+(first?.modelConversion?'<span class="reduction-application-note">'+esc(first.modelConversion)+'</span>':'')+'</td><td><button class="reference-button reduction-original-link" data-reduction-source="'+esc(source.id)+'">'+esc(paper?paperShort(paper):source.id)+' →</button><span class="cell-secondary">'+esc(source.problem)+'</span>'+parentLink+'<button class="text-button reduction-chain-link" data-reduction-derived="'+esc(derived.id)+'">Inspect computed chain →</button></td></tr>';
      }).join('');
      return html+'</tbody></table></div></details>';
    }

    function renderDetail(r,rows,state) {
      const panel=$('#reduction-detail');panel.hidden=!r;
      if(!r){panel.innerHTML='';return;}
      const outside=!rows.some(item=>item.id===r.id);
      const examples=(r.examples||[]).filter(example=>results[example.resultId]);
      panel.innerHTML='<div class="reduction-detail-body"><div class="reduction-detail-heading"><div><p class="eyebrow">'+esc(statusLabels[r.status]||r.status)+'</p><h3>'+esc(r.title)+'</h3><p>'+esc(problem(r.from).label)+' <span aria-hidden="true">→</span><span class="sr-only">uses an algorithm for</span> '+esc(problem(r.to).label)+'</p></div><button class="text-button" data-reduction-close aria-label="Close reduction details">Close ×</button></div>'+
        (outside?'<p class="reduction-outside-note">This selected recipe is outside the current filters. <button class="text-button" data-reduction-show-selected>Show its row →</button></p>':'')+
        '<p class="reduction-summary">'+graphText(r.summary)+'</p><div class="reduction-detail-metrics"><div><span>Round complexity using a T-round algorithm</span><div class="reduction-runtime">'+formula(r.runtime,'math',r.parameterDefinitions)+'</div></div><div><span>Approximation transfer</span><div class="reduction-guarantee">'+formula(r.guarantee,'math',r.parameterDefinitions)+'</div></div><div><span>Input instance</span>'+formula(r.instance.graph,'math',r.parameterDefinitions)+'</div></div>'+
        '<p class="reduction-instance-description">'+graphText(r.instance.description)+'</p><div class="reduction-detail-models">'+modelList(r)+'</div><h4>Conditions and construction</h4><ul class="reduction-conditions">'+r.conditions.map(condition=>'<li>'+graphText(condition)+'</li>').join('')+'</ul>'+
        applications(r,state)+
        (examples.length?'<h4>Related source bounds</h4><ul class="reduction-related-sources">'+examples.map(example=>{const source=results[example.resultId],paper=paperMap[source.paperId];return '<li><button class="text-button" data-reduction-source="'+esc(source.id)+'">'+esc(paper?paperShort(paper):source.id)+' · '+esc(source.problem)+' →</button>'+(example.notes?'<p>'+esc(example.notes)+'</p>':'')+'</li>';}).join('')+'</ul>':'')+
        '<p class="reduction-source-note">'+sourceLink(r.source)+(r.source.location?' · '+esc(r.source.location):'')+'</p></div>';
    }

    function selectRecipe(id) {
      if(!byId[id])return;
      updateState({reduction:id});
      const panel=$('#reduction-detail');panel?.scrollIntoView?.({block:'start',behavior:'instant'});panel?.focus({preventScroll:true});
    }

    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-reduction-select],[data-reduction-problem],[data-reduction-source],[data-reduction-derived],[data-reduction-catalog],[data-reduction-reset],[data-reduction-close],[data-reduction-show-selected]');
      if(!button||!button.closest('#reductions-view'))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(button.dataset.reductionSelect){selectRecipe(button.dataset.reductionSelect);return;}
      if(button.dataset.reductionProblem){updateState({reductionProblem:button.dataset.reductionProblem,reduction:''});$('#reduction-problem')?.focus({preventScroll:true});return;}
      if(button.dataset.reductionSource){openResult(button.dataset.reductionSource);return;}
      if(button.dataset.reductionDerived){openResult(button.dataset.reductionDerived);return;}
      if(button.dataset.reductionCatalog){
        const r=byId[getState().reduction];if(!r||!r.engine?.[button.dataset.reductionCatalog])return;
        const bound=button.dataset.reductionCatalog;
        showCatalog({problem:problem(bound==='lower'?r.to:r.from).label,bound,model:getState().reductionModel||'',problemTransfer:true});return;
      }
      if(button.hasAttribute('data-reduction-close')){updateState({reduction:''});$('#reductions-table-scroll')?.focus({preventScroll:true});return;}
      if(button.hasAttribute('data-reduction-show-selected')){updateState({reductionProblem:'',reductionModel:'',reductionKind:'',reductionQ:''});return;}
      if(button.hasAttribute('data-reduction-reset')){updateState({reductionProblem:'',reductionModel:'',reductionKind:'',reductionQ:'',reduction:''});$('#reduction-search')?.focus({preventScroll:true});}
    },true);
    document.addEventListener('change',event=>{
      if(!event.target.closest('#reductions-view'))return;
      const fields={'reduction-problem':'reductionProblem','reduction-model':'reductionModel','reduction-kind':'reductionKind','reduction-bound':'reductionBound'};
      const field=fields[event.target.id];if(!field)return;
      updateState({[field]:event.target.value,...(field==='reductionBound'?{}:{reduction:''})});
    });
    document.addEventListener('input',event=>{
      if(event.target.id==='reduction-search')updateState({reductionQ:event.target.value,reduction:''});
    });

    function render() {
      if(!$('#reductions-view'))return;
      ensureControls();
      const state=getState(),rows=filtered(state),selected=byId[state.reduction]||null;
      for(const [id,key] of [['reduction-problem','reductionProblem'],['reduction-model','reductionModel'],['reduction-kind','reductionKind'],['reduction-search','reductionQ'],['reduction-bound','reductionBound']]){
        const control=$('#'+id);if(control.value!==(state[key]||''))control.value=state[key]||'';
      }
      $('#reduction-count').textContent=rows.length+' of '+entries.length+' reductions';
      $('#reduction-empty').hidden=rows.length>0;
      if(!rows.length)$('#reduction-empty').innerHTML='<p>No matching reductions.</p><button class="text-button" data-reduction-reset>Reset reduction filters →</button>';
      $('#reductions-table-scroll').hidden=!rows.length;
      renderMap(rows,selected);renderRows(rows,selected);renderDetail(selected,rows,state);
      typeset($('#reductions-view'));
    }
    return {render};
  }
  window.AtlasReductionsView={create};
})();
