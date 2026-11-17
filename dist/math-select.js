/* MathJax labels for select-only controls; native selects retain values/events. */
(() => {
  'use strict';
  const instances=new Map();
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalized=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  let opened=null,nextId=0;

  function enhance(select,options={}){
    if(instances.has(select))return instances.get(select);
    const renderLabel=options.renderLabel||(value=>window.AtlasMath?.text?.(value,[],false)||escape(value));
    const typeset=options.typeset||(root=>window.AtlasMath?.render(root));
    const id=select.id||'math-select-'+(++nextId),labels=[...(select.labels||[])];
    const labelName=select.getAttribute('aria-label')||labels.map(label=>[...label.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent).join(' ').trim()||label.textContent.trim()).filter(Boolean).join(' ')||'Graph class';
    const wrapper=document.createElement('span');wrapper.className='math-select';wrapper.dataset.mathSelect=id;
    const button=document.createElement('button');button.type='button';button.id=id+'-picker';button.className='math-select-trigger';
    button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
    const described=select.getAttribute('aria-describedby');if(described)button.setAttribute('aria-describedby',described);
    const current=document.createElement('span');current.className='math-select-value';button.append(current);
    const chevron=document.createElement('span');chevron.className='math-select-chevron';chevron.setAttribute('aria-hidden','true');button.append(chevron);
    const popup=document.createElement('span');popup.id=id+'-options';popup.className='math-select-popup';popup.setAttribute('role','listbox');popup.setAttribute('aria-label',labelName);popup.hidden=true;
    select.before(wrapper);wrapper.append(select,button);
    select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    for(const label of labels)if(label.htmlFor===select.id)label.htmlFor=button.id;
    let active=-1,isOpen=false,signature='',valueLabel=null,entries=[],optionNodes=[],typeBuffer='',lastTyped=0;

    function renderMath(root){
      const done=typeset(root);
      done?.then(()=>{if(isOpen){position();revealActive();}}).catch(error=>console.warn('Could not render graph-class picker:',error));
    }
    function position(){
      if(!isOpen)return;
      const anchor=button.getBoundingClientRect(),margin=12,gap=6;
      const width=Math.max(1,Math.min(window.innerWidth-margin*2,Math.max(anchor.width,288)));
      const below=window.innerHeight-anchor.bottom-gap-margin,above=anchor.top-gap-margin;
      const upwards=below<Math.min(240,popup.scrollHeight)&&above>below;
      const available=Math.max(72,upwards?above:below);
      popup.style.width=width+'px';popup.style.maxHeight=Math.min(416,available)+'px';
      popup.style.left=Math.max(margin,Math.min(anchor.left,window.innerWidth-width-margin))+'px';
      popup.style.top=(upwards?Math.max(margin,anchor.top-gap-popup.getBoundingClientRect().height):Math.max(margin,anchor.bottom+gap))+'px';
    }
    function revealActive(){
      const option=optionNodes[active];if(!isOpen||!option)return;
      const top=option.offsetTop,bottom=top+option.offsetHeight;
      if(top<popup.scrollTop)popup.scrollTop=top;
      else if(bottom>popup.scrollTop+popup.clientHeight)popup.scrollTop=bottom-popup.clientHeight;
    }
    function setActive(index){
      active=index;
      optionNodes.forEach((node,i)=>node.classList.toggle('is-active',i===active));
      if(active>=0)button.setAttribute('aria-activedescendant',id+'-option-'+active);
      else button.removeAttribute('aria-activedescendant');
      revealActive();
    }
    function nextEnabled(start,direction){
      for(let count=0,index=start;count<entries.length;count++){
        index=(index+direction+entries.length)%entries.length;
        if(!entries[index].disabled)return index;
      }
      return -1;
    }
    function buildOptions(){
      popup.innerHTML=entries.map((entry,index)=>'<span id="'+escape(id+'-option-'+index)+'" class="math-select-option" role="option" data-option-index="'+index+'" data-option-label="'+escape(entry.label)+'" aria-selected="'+String(index===select.selectedIndex)+'"'+(entry.disabled?' aria-disabled="true"':'')+'>'+renderLabel(entry.label)+'</span>').join('');
      optionNodes=[...popup.children];
    }
    function sync(){
      entries=[...select.options].map(option=>({value:option.value,label:option.label,disabled:option.disabled||option.closest('optgroup')?.disabled===true}));
      const nextSignature=JSON.stringify(entries);
      if(nextSignature!==signature){signature=nextSignature;optionNodes=[];popup.replaceChildren();if(isOpen)buildOptions();}
      button.disabled=select.disabled;
      const label=entries[select.selectedIndex]?.label||'';
      if(label!==valueLabel){valueLabel=label;current.innerHTML=renderLabel(label);renderMath(button);}
      button.setAttribute('aria-label',labelName+(label?': '+label:''));
      for(const [index,node] of optionNodes.entries())node.setAttribute('aria-selected',String(index===select.selectedIndex));
      if(isOpen){setActive(entries[select.selectedIndex]?.disabled?nextEnabled(-1,1):select.selectedIndex);renderMath(popup);position();}
    }
    function close(commit=false){
      if(!isOpen)return;
      const chosen=active;isOpen=false;opened=null;typeBuffer='';
      button.setAttribute('aria-expanded','false');button.removeAttribute('aria-activedescendant');button.removeAttribute('aria-controls');popup.hidden=true;popup.remove();
      if(commit&&chosen>=0&&!entries[chosen].disabled&&select.selectedIndex!==chosen){
        select.selectedIndex=chosen;sync();
        select.dispatchEvent(new Event('input',{bubbles:true}));
        select.dispatchEvent(new Event('change',{bubbles:true}));
      }
    }
    function open(){
      if(isOpen||button.disabled)return;
      opened?.close();sync();
      if(!optionNodes.length)buildOptions();
      (select.closest('dialog[open]')||document.body).append(popup);
      popup.hidden=false;isOpen=true;opened=instance;button.setAttribute('aria-expanded','true');button.setAttribute('aria-controls',popup.id);
      setActive(entries[select.selectedIndex]?.disabled?nextEnabled(-1,1):select.selectedIndex);
      position();renderMath(popup);
    }
    function findTyped(character){
      const now=Date.now();typeBuffer=now-lastTyped<750?typeBuffer+character:character;lastTyped=now;
      const repeated=[...typeBuffer].every(c=>c===typeBuffer[0]),query=normalized(repeated?typeBuffer[0]:typeBuffer);
      if(typeBuffer.length>1&&!repeated&&active>=0&&!entries[active].disabled&&normalized(entries[active].label).startsWith(query))return;
      for(let step=1;step<=entries.length;step++){
        const index=(Math.max(-1,active)+step)%entries.length;
        if(!entries[index].disabled&&normalized(entries[index].label).startsWith(query)){setActive(index);return;}
      }
    }
    button.addEventListener('click',()=>{if(isOpen)close();else open();});
    button.addEventListener('keydown',event=>{
      if(event.ctrlKey||event.metaKey)return;
      const key=event.key;
      if(key==='Tab'){if(isOpen)close(true);return;}
      if(key==='Escape'){if(isOpen){event.preventDefault();event.stopPropagation();close();}return;}
      if(event.altKey&&key==='ArrowUp'){if(isOpen){event.preventDefault();close(true);}return;}
      if(event.altKey&&key!=='ArrowDown')return;
      if(['ArrowDown','ArrowUp','Home','End','PageDown','PageUp','Enter',' '].includes(key)){
        event.preventDefault();
        if(key==='Enter'||key===' '){if(isOpen)close(true);else open();return;}
        open();
        if(event.altKey)return;
        if(key==='Home')setActive(nextEnabled(-1,1));
        else if(key==='End')setActive(nextEnabled(0,-1));
        else {const direction=key==='ArrowUp'||key==='PageUp'?-1:1,count=key.startsWith('Page')?10:1;for(let i=0;i<count;i++)setActive(nextEnabled(active,direction));}
        return;
      }
      if(key.length===1&&!event.altKey){event.preventDefault();open();findTyped(key);}
    });
    popup.addEventListener('pointermove',event=>{
      if(event.pointerType==='touch')return;
      const target=event.target.closest('[data-option-index]');if(target&&!entries[Number(target.dataset.optionIndex)].disabled)setActive(Number(target.dataset.optionIndex));
    });
    popup.addEventListener('click',event=>{
      const target=event.target.closest('[data-option-index]');if(!target)return;
      const index=Number(target.dataset.optionIndex);if(entries[index].disabled)return;
      setActive(index);close(true);button.focus({preventScroll:true});
    });
    select.addEventListener('change',sync);
    select.form?.addEventListener('reset',()=>queueMicrotask(sync));
    const instance={select,button,popup,sync,open,close,focus:()=>button.focus({preventScroll:true}),contains:target=>wrapper.contains(target)||popup.contains(target)||labels.some(label=>label.contains(target)),reposition:position};
    instances.set(select,instance);sync();return instance;
  }
  document.addEventListener('pointerdown',event=>{if(opened&&!opened.contains(event.target))opened.close();},true);
  document.addEventListener('focusin',event=>{if(opened&&!opened.contains(event.target))opened.close();});
  document.addEventListener('scroll',event=>{
    if(!opened||opened.popup.contains(event.target))return;
    if(opened.button.closest('[hidden]'))opened.close();else opened.reposition();
  },true);
  window.addEventListener('resize',()=>{if(opened)opened.reposition();});
  window.addEventListener('hashchange',()=>opened?.close());
  window.addEventListener('beforeprint',()=>opened?.close());
  window.AtlasMathSelect={enhance,sync(select){if(select)instances.get(select)?.sync();else for(const instance of instances.values())instance.sync();},focus(select){const instance=instances.get(select);if(instance)instance.focus();else select?.focus();},close:()=>opened?.close()};
})();
