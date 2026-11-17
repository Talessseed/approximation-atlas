/* Self-hosted MathJax. TeX glyphs are included in the local combined SVG bundle. */
window.MathJax = {
  startup: {typeset: false},
  loader: {paths: {mathjax: new URL('vendor/mathjax/', document.baseURI).href.replace(/\/$/, '')}},
  tex: {packages: ['base', 'ams', 'newcommand', 'configmacros']},
  svg: {fontCache: 'none'},
  options: {
    enableMenu: false,
    enableEnrichment: false,
    enableSpeech: false,
    enableBraille: false,
    enableExplorer: false,
    menuOptions: {settings: {enrich:false, speech:false, braille:false, assistiveMml:false}}
  }
};

(() => {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cache = new Map();
  const pending = new WeakSet();
  function html(value, className = 'math', tex = window.ATLAS_DATA?.notation[value], definitions = []) {
    const parameters=definitions.filter(p=>p?.symbol&&p.description);
    return '<span class="'+escape(className)+'"'+(tex ? ' data-tex="'+escape(tex)+'"' : '')+(parameters.length?' data-parameter-definitions="'+escape(JSON.stringify(parameters))+'"':'')+'>'+escape(value)+'</span>';
  }
  const graphFragments=window.ATLAS_DATA?.graphMathFragments||{},graphTextCache=new Map();
  const fragmentKeys=Object.keys(graphFragments).sort((a,b)=>b.length-a.length);
  const fragmentPattern=fragmentKeys.length?new RegExp(fragmentKeys.map(value=>
    (/[A-Za-z0-9]/.test(value[0])?'(?<![A-Za-z0-9])':'')+
    value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+
    (/[A-Za-z0-9]/.test(value.at(-1))?'(?![A-Za-z0-9])':'')
  ).join('|'),'g'):null;
  function textParts(value) {
    const label=String(value??''),known=window.ATLAS_DATA?.graphNotation?.[label];
    if(known)return known;
    if(graphTextCache.has(label))return graphTextCache.get(label);
    const parts=[];let offset=0;
    if(fragmentPattern)for(const match of label.matchAll(fragmentPattern)){
      const token=match[0],start=match.index,end=start+token.length;
      if(start>offset)parts.push(label.slice(offset,start));
      parts.push(...graphFragments[token]);offset=end;
    }
    if(parts.length&&offset<label.length)parts.push(label.slice(offset));
    const result=parts.length?parts:null;
    if(graphTextCache.size>=1000)graphTextCache.delete(graphTextCache.keys().next().value);
    graphTextCache.set(label,result);return result;
  }
  function text(value, definitions = [], interactive = true) {
    const label=String(value??''),parts=textParts(label);
    if(!parts)return escape(label);
    return parts.map(part=>typeof part==='string'?escape(part):html(part.math,'math graph-math',part.tex||window.ATLAS_DATA.notation[part.math],interactive?definitions:[])).join('');
  }
  const normalizedTex=value=>String(value||'').replace(/\\(?:left|right|displaystyle|textstyle)\b/g,'').replace(/\\varepsilon\b/g,'\\epsilon').replace(/[\s{}]/g,'');
  let tooltip,activeTarget,hideTimer;
  function hideTooltip(){clearTimeout(hideTimer);if(activeTarget)activeTarget.removeAttribute('aria-describedby');activeTarget=null;if(tooltip)tooltip.hidden=true;}
  function tooltipBox(){
    if(tooltip)return tooltip;
    tooltip=document.createElement('div');tooltip.id='parameter-tooltip';tooltip.className='parameter-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip);
    tooltip.addEventListener('pointerenter',()=>clearTimeout(hideTimer));tooltip.addEventListener('pointerleave',()=>scheduleHide());return tooltip;
  }
  function showTooltip(target){
    const description=target.dataset.parameterDescription||target.dataset.parameterSummary;if(!description)return;
    clearTimeout(hideTimer);if(activeTarget&&activeTarget!==target)activeTarget.removeAttribute('aria-describedby');activeTarget=target;
    const box=tooltipBox(),dialog=target.closest('dialog[open]');(dialog||document.body).append(box);
    box.textContent=(target.dataset.parameter?target.dataset.parameter+' — ':'')+description;box.dataset.parameter=target.dataset.parameter||'';box.hidden=false;target.setAttribute('aria-describedby',box.id);
    const margin=12,frame=dialog?.getBoundingClientRect(),leftEdge=Math.max(margin,(frame?.left||0)+margin),rightEdge=Math.min(window.innerWidth-margin,frame?frame.right-margin:window.innerWidth-margin);
    box.style.maxWidth=Math.max(120,Math.min(432,rightEdge-leftEdge))+'px';
    const anchor=target.getBoundingClientRect(),bounds=box.getBoundingClientRect();
    let left=anchor.left+anchor.width/2-bounds.width/2,top=anchor.top-bounds.height-10;
    if(top<margin)top=anchor.bottom+10;
    left=Math.max(leftEdge,Math.min(left,rightEdge-bounds.width));top=Math.max(margin,Math.min(top,window.innerHeight-bounds.height-margin));
    box.style.left=left+'px';box.style.top=top+'px';
  }
  function scheduleHide(){clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(activeTarget!==document.activeElement&&!activeTarget?.contains(document.activeElement))hideTooltip();},120);}
  function parameterTarget(target,includeSummary=false){return target?.closest?.(includeSummary?'[data-parameter-description],[data-parameter-summary]':'[data-parameter-description]');}
  document.addEventListener('pointerover',event=>{const target=parameterTarget(event.target);if(target)showTooltip(target);});
  document.addEventListener('pointerout',event=>{if(event.pointerType==='touch')return;const target=parameterTarget(event.target);if(target&&!target.contains(event.relatedTarget)&&!tooltip?.contains(event.relatedTarget))scheduleHide();});
  document.addEventListener('focusin',event=>{const target=parameterTarget(event.target,true);if(target)showTooltip(target);else hideTooltip();});
  document.addEventListener('focusout',event=>{if(parameterTarget(event.target,true))scheduleHide();});
  document.addEventListener('pointerdown',event=>{if(activeTarget&&!activeTarget.contains(event.target)&&!tooltip?.contains(event.target))hideTooltip();});
  document.addEventListener('click',event=>{const target=parameterTarget(event.target);if(target){showTooltip(target);if(target.matches('.parameter-token,.parameter-hitbox'))event.stopPropagation();}});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&tooltip&&!tooltip.hidden){hideTooltip();event.preventDefault();event.stopImmediatePropagation();return;}
    const target=parameterTarget(event.target);if(target&&target.matches('.parameter-token,.parameter-hitbox,.parameter-inline[tabindex]')&&(event.key==='Enter'||event.key===' ')){event.preventDefault();showTooltip(target);}
  },true);
  document.addEventListener('close',()=>hideTooltip(),true);
  document.addEventListener('scroll',()=>{
    if(activeTarget&&(activeTarget===document.activeElement||activeTarget.contains(document.activeElement))){
      const bounds=activeTarget.getBoundingClientRect();
      if(bounds.bottom>0&&bounds.top<window.innerHeight&&bounds.right>0&&bounds.left<window.innerWidth){showTooltip(activeTarget);return;}
    }
    hideTooltip();
  },true);
  new MutationObserver(()=>{if(activeTarget&&(!activeTarget.isConnected||activeTarget.closest('[hidden]')))hideTooltip();}).observe(document.documentElement,{childList:true,subtree:true});

  function parameterTargets(element){
    const oldTargets=new Map([...element.querySelectorAll(':scope > .parameter-hitbox')].map(node=>[node.dataset.parameterOccurrence,node]));
    let definitions;try{definitions=JSON.parse(element.dataset.parameterDefinitions||'[]');}catch{return;}
    if(!definitions.length)return;
    const groups=[...element.querySelectorAll('g[data-latex][data-mml-node]')].filter(g=>['mi','msub','msup'].includes(g.dataset.mmlNode)).map(group=>({group,key:normalizedTex(group.dataset.latex)}));
    const targets=[],claimed=new Set();
    for(const definition of definitions.slice().sort((a,b)=>String(b.tex||b.symbol).length-String(a.tex||a.symbol).length)){
      const tex=definition.tex||window.ATLAS_DATA?.notation[definition.symbol]||definition.symbol,key=normalizedTex(tex);
      let candidates=groups.filter(g=>g.key===key);
      // A function parameter such as f(k) is explained at its function symbol;
      // the argument k retains its own independent definition.
      if(!candidates.length&&/^[A-Za-z]\(/.test(definition.symbol))candidates=groups.filter(g=>g.key===definition.symbol[0]);
      for(const {group} of candidates){
        if(claimed.has(group)||[...claimed].some(parent=>parent.contains(group)))continue;
        claimed.add(group);targets.push({group,definition});
      }
    }
    const meanings=[...new Map(targets.map(({definition})=>[definition.symbol,definition])).values()];
    return {element,oldTargets,targets,meanings};
  }
  function measureParameterTargets(plan){
    const {element,targets}=plan,origin=element.getBoundingClientRect(),scrollLeft=element.scrollLeft,scrollTop=element.scrollTop;
    plan.boxes=targets.map(({group,definition})=>{
      const bounds=group.getBoundingClientRect();
      return {definition,left:bounds.left-origin.left+scrollLeft,top:bounds.top-origin.top+scrollTop,width:bounds.width,height:bounds.height};
    }).filter(bounds=>bounds.width&&bounds.height);
  }
  function applyParameterTargets({element,oldTargets,boxes,meanings}){
    const retained=new Set(),occurrences=new Map(),used=new Set();
    for(const {definition,left,top,width,height} of boxes){
      const occurrence=occurrences.get(definition.symbol)||0,key=definition.symbol+':'+occurrence;occurrences.set(definition.symbol,occurrence+1);
      const hit=oldTargets.get(key)||document.createElement('span');retained.add(hit);hit.className='parameter-hitbox';hit.dataset.parameterOccurrence=key;hit.dataset.parameter=definition.symbol;hit.dataset.parameterDescription=definition.description;
      hit.setAttribute('role','term');hit.setAttribute('aria-label',definition.symbol+': '+definition.description);hit.tabIndex=used.has(definition.symbol)?-1:0;used.add(definition.symbol);
      hit.style.left=left+'px';hit.style.top=top+'px';hit.style.width=width+'px';hit.style.height=height+'px';if(hit.parentNode!==element)element.append(hit);
    }
    for(const node of oldTargets.values())if(!retained.has(node))node.remove();
    if(meanings.length){element.setAttribute('role',used.size?'group':'math');element.setAttribute('aria-description',meanings.map(p=>p.symbol+': '+p.description).join('; '));}
  }
  async function render(root = document) {
    if (!window.MathJax.startup?.promise) return;
    try {
      await window.MathJax.startup.promise;
      const elements = [...root.querySelectorAll('[data-tex]:not([data-math-ready])')];
      await Promise.all(elements.map(async element => {
        if (pending.has(element)) return;
        pending.add(element);
        const tex = element.dataset.tex;
        try {
          if (!cache.has(tex)) cache.set(tex, Promise.resolve(window.MathJax.tex2svgPromise(tex, {display:false})).then(output=>{
            if(output.querySelector('[data-mml-node="merror"]'))throw new Error('Invalid TeX: '+tex);
            return output;
          }));
          const output = await cache.get(tex);
          if (!element.isConnected || element.dataset.tex !== tex) return;
          const label = element.textContent;
          const copy = output.cloneNode(true);
          // Preserve a readable expression for assistive technology and failed loads.
          copy.setAttribute('aria-hidden','true');
          element.setAttribute('role','math');
          element.setAttribute('aria-label',label);
          element.replaceChildren(copy);
          element.dataset.mathReady = 'true';
        } catch (error) {
          element.dataset.mathError = 'true';
          console.warn('Could not render atlas formula:', error);
        } finally {pending.delete(element);}
      }));
      if(elements.length){window.MathJax.startup.document.reset();window.MathJax.startup.document.updateDocument();}
      // Wide formulas scroll within their own cells/cards and stay keyboard reachable.
      // Read every formula before changing classes or attributes, so the browser
      // can perform one layout instead of laying out the table after each cell.
      const scrollMetrics=[...root.querySelectorAll('.round-bound, .approx-cell > .math, .compare-table td > .math, .reduction-derived-guarantee > .math, .folklore-note > .math, .metric > .math, .reduction-detail-metrics .math')].map(element=>{
        const style = getComputedStyle(element);
        const scrolls = /auto|scroll/.test(style.overflowX+style.overflowY) &&
          (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight);
        const horizontal = /auto|scroll/.test(style.overflowX) && element.scrollWidth > element.clientWidth+1;
        return {element,scrolls,horizontal};
      });
      for(const {element,scrolls,horizontal} of scrollMetrics){
        element.classList.toggle('formula-scrollable', horizontal);
        if (horizontal && !element.hasAttribute('title')) {
          element.title='Scroll horizontally to read the full formula';
          element.dataset.scrollTitle='true';
        } else if (!horizontal && element.dataset.scrollTitle) {
          element.removeAttribute('title');
          delete element.dataset.scrollTitle;
        }
        if (scrolls) element.tabIndex=0;
        else element.removeAttribute('tabindex');
      }
      const plans=[...root.querySelectorAll('[data-parameter-definitions][data-math-ready]')].map(parameterTargets).filter(Boolean);
      // Establish the containing boxes before measuring SVG glyphs, then keep
      // geometry reads separate from all hitbox creation and positioning.
      for(const {element,meanings} of plans)if(meanings.length)element.classList.add('parameter-formula');
      plans.forEach(measureParameterTargets);
      plans.forEach(applyParameterTargets);
      if(activeTarget?.isConnected&&tooltip&&!tooltip.hidden)showTooltip(activeTarget);
    } catch (error) {console.warn('MathJax unavailable; keeping readable formulas.',error);}
  }
  let rendering = Promise.resolve(),queued=[],scheduled=false;
  async function flush(){
    scheduled=false;
    const requests=queued;queued=[];
    const roots=[...new Set(requests.map(request=>request.root))];
    // Synchronous UI updates often request the document and a dialog together.
    // A containing root already covers its descendants in this rendering pass.
    const outerRoots=roots.filter(root=>!roots.some(other=>other!==root&&other.contains(root)));
    for(const root of outerRoots)await render(root);
    for(const request of requests)request.resolve();
  }
  window.AtlasMath = {html, text, hasText:value=>!!textParts(value), render(root = document) {
    // A caller can await this to include work started by an earlier UI render.
    const complete=new Promise(resolve=>queued.push({root,resolve}));
    if(!scheduled){scheduled=true;rendering=rendering.then(flush);}
    return complete;
  }};
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if(!window.document?.documentElement)return;
      document.querySelectorAll('.view:not([hidden]),dialog[open]').forEach(root=>window.AtlasMath.render(root));
    }, 100);
  });
})();
