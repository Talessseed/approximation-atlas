(function(root){
  'use strict';
  const views=new WeakMap();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labelHtml=value=>root.AtlasMath?.text?root.AtlasMath.text(value,[],false):esc(value);
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const edgeKey=edge=>JSON.stringify([edge.source,edge.target,edge.reference||'',edge.reason||'']);

  function render(container,options){
    const layout=options.layoutMode==='focused'?root.AtlasNetworkLayout.focused(options.nodes,options.edges,options.focusId):root.AtlasNetworkLayout.layout(options.nodes,options.edges);
    let view=views.get(container);
    if(!view){view=create(container);views.set(container,view);}
    view.render(layout,options);
    return view;
  }

  function create(container){
    const id=container.id,helpId=id+'-help';
    container.innerHTML='<div class="network-toolbar" role="group" aria-label="Graph controls"><span class="network-count"></span><div class="network-camera-controls"><button type="button" data-network-action="zoom-out" aria-label="Zoom out" title="Zoom out">−</button><output class="network-zoom" aria-live="off" aria-label="Graph zoom">100%</output><button type="button" data-network-action="zoom-in" aria-label="Zoom in" title="Zoom in">+</button><button type="button" data-network-action="fit">Fit graph</button><button type="button" data-network-action="center">Center selection</button></div></div>'
      +'<div class="network-stage"><div class="network-viewport"><svg class="inclusion-network" role="group" xmlns="http://www.w3.org/2000/svg"></svg></div>'
      +'<section id="'+id+'-edge-details" class="network-edge-details" role="region" aria-labelledby="'+id+'-edge-title" tabindex="-1" hidden><div class="network-edge-heading"><h3 id="'+id+'-edge-title"></h3><button type="button" class="text-button" data-network-action="clear-edge" aria-label="Clear selected relationship">×</button></div><div class="network-edge-content"></div></section></div>'
      +'<p class="network-navigation-help" id="'+helpId+'">Select an edge for details · Drag or scroll to move · + / − to zoom · Home to fit</p><span class="sr-only network-selection-status" role="status"></span>';
    container.setAttribute('aria-describedby',helpId);
    const viewport=container.querySelector('.network-viewport'),svg=viewport.querySelector('svg'),output=container.querySelector('.network-zoom');
    const details=container.querySelector('.network-edge-details'),status=container.querySelector('.network-selection-status');
    let camera,layout,options,width=1000,height=540,gesture=null,blockClick=false,focusId,printing=false,selectedEdgeKey=null,pointerFocusPending=false,pointerSequence=0;
    const edgeTitle=edge=>layout.nodes.find(n=>n.id===edge.source).label+(options.kind==='class'?' ⊆ ':' → ')+layout.nodes.find(n=>n.id===edge.target).label;
    function syncSelection(announce=false){
      const index=layout.edges.findIndex(edge=>edgeKey(edge)===selectedEdgeKey),edge=layout.edges[index];
      svg.querySelectorAll('[data-network-edge]').forEach(group=>{
        const selected=Number(group.dataset.networkEdge)===index;
        group.classList.toggle('is-selected',selected);group.setAttribute('aria-pressed',String(selected));
        const line=group.querySelector('.network-edge'),item=layout.edges[Number(group.dataset.networkEdge)];
        line.setAttribute('marker-end','url(#'+id+'-arrow-'+(selected?'selected':item.kind||'inclusion')+')');
      });
      details.hidden=!edge;
      container.dataset.selectedEdge=edge?JSON.stringify([edge.source,edge.target]):'';
      if(edge){
        const source=layout.nodes.find(node=>node.id===edge.source),target=layout.nodes.find(node=>node.id===edge.target);
        const symbol=options.kind==='class'?'⊆':'→',tex=options.kind==='class'?'\\subseteq':'\\to';
        details.querySelector('h3').innerHTML=labelHtml(source.label)+' '+(root.AtlasMath?.html?root.AtlasMath.html(symbol,'network-edge-symbol',tex):esc(symbol))+' '+labelHtml(target.label);
        details.querySelector('.network-edge-content').innerHTML=options.edgeDetails?options.edgeDetails(edge):'<p>'+esc(edge.description||'')+'</p>';
        root.AtlasMath?.render(details);
      }else{selectedEdgeKey=null;details.querySelector('.network-edge-content').replaceChildren();}
      if(announce)status.textContent=edge?edgeTitle(edge)+' selected.':'Relationship selection cleared.';
      else if(!edge)status.textContent='';
    }
    function clearEdge(restoreFocus=false){
      const index=layout.edges.findIndex(edge=>edgeKey(edge)===selectedEdgeKey),button=svg.querySelector('[data-network-edge="'+index+'"]');
      selectedEdgeKey=null;syncSelection(true);
      if(restoreFocus){pointerFocusPending=false;button?.focus({preventScroll:true});}
    }
    function selectEdge(index,keyboard=false){
      const edge=layout.edges[index];if(!edge)return;
      selectedEdgeKey=selectedEdgeKey===edgeKey(edge)?null:edgeKey(edge);syncSelection(true);
      if(keyboard&&!details.hidden)details.focus({preventScroll:true});
    }
    const size=()=>{const box=viewport.getBoundingClientRect();return {width:box.width||1000,height:box.height||540};};
    function update(){
      if(!camera)return;
      svg.querySelector('.network-camera')?.setAttribute('transform',printing?'':'translate('+camera.x+' '+camera.y+') scale('+camera.scale+')');
      const headings=svg.querySelector('.network-column-headings');
      if(headings){
        headings.querySelector('rect').setAttribute('width',printing?layout.width:width);
        headings.querySelectorAll('text').forEach((text,index)=>text.setAttribute('x',printing?layout.columns[index].x:camera.x+layout.columns[index].x*camera.scale));
      }
      container.dataset.scale=String(camera.scale);container.dataset.panX=String(camera.x);container.dataset.panY=String(camera.y);
      output.textContent=Math.round(camera.scale*100)+'%';
      container.querySelector('[data-network-action="zoom-out"]').disabled=camera.scale<=0.025;
      container.querySelector('[data-network-action="zoom-in"]').disabled=camera.scale>=2.5;
    }
    function fit(){
      if(!layout)return;
      const scale=clamp(Math.min((width-56)/layout.width,(height-56)/layout.height),0.025,1.1);
      camera={scale,x:(width-layout.width*scale)/2,y:(height-layout.height*scale)/2};update();
    }
    function center(id=options.focusId,readable=true){
      const node=layout.nodes.find(n=>n.id===id);if(!node)return;
      const readableScale=options.layoutMode==='focused'?clamp((width-56)/layout.width,1.02,1.44):1.02;
      const scale=readable?Math.max(readableScale,Math.min(camera?.scale||readableScale,1.44)):camera.scale;
      camera={scale,x:width/2-(node.x+node.width/2)*scale,y:height/2-(node.y+node.height/2)*scale};update();
    }
    function zoom(factor,anchor={x:width/2,y:height/2}){
      if(!camera)return;
      const scale=clamp(camera.scale*factor,0.025,2.5),ratio=scale/camera.scale;
      camera={scale,x:anchor.x-(anchor.x-camera.x)*ratio,y:anchor.y-(anchor.y-camera.y)*ratio};update();
    }
    function resize(){
      if(printing&&layout){svg.setAttribute('viewBox','0 0 '+layout.width+' '+layout.height);return;}
      const next=size(),oldWidth=width,oldHeight=height;width=next.width;height=next.height;
      svg.setAttribute('viewBox','0 0 '+width+' '+height);
      if(camera){camera.x+=(width-oldWidth)/2;camera.y+=(height-oldHeight)/2;update();}
    }
    function finish(event){
      if(!gesture||event.pointerId!==gesture.id)return;
      if(gesture.dragged){blockClick=true;event.preventDefault();}
      if(viewport.hasPointerCapture?.(event.pointerId))viewport.releasePointerCapture(event.pointerId);
      gesture=null;viewport.classList.remove('is-panning');
    }
    viewport.addEventListener('pointerdown',event=>{
      if(event.button!==0||event.isPrimary===false)return;
      pointerFocusPending=true;pointerSequence++;
      blockClick=false;gesture={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:camera.x,y:camera.y,dragged:false};
    });
    root.addEventListener('pointerdown',event=>{if(!viewport.contains(event.target))pointerFocusPending=false;},{capture:true});
    root.addEventListener('keydown',()=>{pointerFocusPending=false;},{capture:true});
    root.addEventListener('pointermove',event=>{
      if(!gesture||event.pointerId!==gesture.id)return;
      const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
      if(!gesture.dragged&&Math.hypot(dx,dy)<5)return;
      if(!gesture.dragged){gesture.dragged=true;viewport.classList.add('is-panning');viewport.setPointerCapture?.(event.pointerId);}
      event.preventDefault();camera.x=gesture.x+dx;camera.y=gesture.y+dy;update();
    },{passive:false});
    root.addEventListener('pointerup',finish);
    root.addEventListener('pointercancel',event=>{finish(event);blockClick=false;pointerFocusPending=false;});
    viewport.addEventListener('click',event=>{
      // Touch can focus the SVG after pointerup, during the compatibility click.
      const sequence=pointerSequence;
      root.setTimeout(()=>{if(sequence===pointerSequence)pointerFocusPending=false;},0);
      if(!blockClick)return;
      blockClick=false;event.preventDefault();event.stopImmediatePropagation();
    },true);
    viewport.addEventListener('dragstart',event=>event.preventDefault());
    viewport.addEventListener('wheel',event=>{
      if(!camera||printing)return;
      event.preventDefault();
      const pixels=(delta,extent)=>delta*(event.deltaMode===1?16:event.deltaMode===2?extent:1);
      const dx=pixels(event.deltaX,width),dy=pixels(event.deltaY,height);
      if(event.ctrlKey){
        const box=viewport.getBoundingClientRect();zoom(Math.exp(-dy*0.005),{x:event.clientX-box.left,y:event.clientY-box.top});
      }else{
        camera.x-=dx+(event.shiftKey?dy:0);
        if(!event.shiftKey)camera.y-=dy;
        update();
      }
    },{passive:false});
    container.addEventListener('click',event=>{
      const edge=event.target.closest('[data-network-edge]');
      if(edge){event.preventDefault();selectEdge(Number(edge.dataset.networkEdge));return;}
      if(viewport.contains(event.target)&&!event.target.closest('a')){if(selectedEdgeKey)clearEdge();return;}
      const control=event.target.closest('[data-network-action]');if(!control)return;
      const action=control.dataset.networkAction;
      if(action==='clear-edge')clearEdge(true);else if(action==='fit')fit();else if(action==='center')center();else zoom(action==='zoom-in'?1.25:0.8);
    });
    container.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&selectedEdgeKey){event.preventDefault();clearEdge(true);return;}
      const edge=event.target.closest('[data-network-edge]');
      if(edge&&(event.key==='Enter'||event.key===' ')){event.preventDefault();selectEdge(Number(edge.dataset.networkEdge),true);return;}
      if(event.target.closest('.network-edge-details'))return;
      if(event.target.closest('button')||event.altKey||event.metaKey||event.ctrlKey)return;
      const step=event.shiftKey?150:60;
      if(event.key==='+'||event.key==='=')zoom(1.25);
      else if(event.key==='-'||event.key==='−')zoom(0.8);
      else if(event.key==='Home'||event.key==='0')fit();
      else if(event.key==='ArrowLeft')camera.x+=step;
      else if(event.key==='ArrowRight')camera.x-=step;
      else if(event.key==='ArrowUp')camera.y+=step;
      else if(event.key==='ArrowDown')camera.y-=step;
      else return;
      event.preventDefault();update();
    });
    container.addEventListener('focusin',event=>{
      const edge=event.target.closest('[data-network-edge]');
      if(edge&&camera){
        if(gesture||pointerFocusPending)return;
        const line=edge.querySelector('.network-edge'),item=layout.edges[Number(edge.dataset.networkEdge)];
        const a=item.points[0],b=item.points.at(-1);
        const point=line.getPointAtLength?line.getPointAtLength(line.getTotalLength()/2):{x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        const x=camera.x+point.x*camera.scale,y=camera.y+point.y*camera.scale;
        if(x<12||x>width-12||y<(layout.columns?48:12)||y>height-12){camera.x=width/2-point.x*camera.scale;camera.y=height/2-point.y*camera.scale;update();}
        return;
      }
      const node=event.target.closest('a')?.querySelector('[data-node-id]');if(!node||!camera)return;
      const pos=layout.nodes.find(n=>n.id===node.dataset.nodeId);if(!pos)return;
      const left=camera.x+pos.x*camera.scale,top=camera.y+pos.y*camera.scale;
      if(left<12||top<12||left+pos.width*camera.scale>width-12||top+pos.height*camera.scale>height-12)center(pos.id);
    });
    if(root.ResizeObserver)new root.ResizeObserver(resize).observe(viewport);
    else root.addEventListener('resize',resize);
    function printMode(active){
      printing=active;resize();update();
    }
    const printMedia=root.matchMedia?.('print');
    if(printMedia?.addEventListener)printMedia.addEventListener('change',event=>printMode(event.matches));
    else printMedia?.addListener?.(event=>printMode(event.matches));
    root.addEventListener('beforeprint',()=>printMode(true));
    root.addEventListener('afterprint',()=>printMode(false));

    function draw(nextLayout,nextOptions){
      const previousFocus=focusId;layout=nextLayout;options=nextOptions;focusId=options.focusId;
      if(previousFocus!==focusId)selectedEdgeKey=null;
      const prefix=esc(id)+'-arrow-',problem=options.kind==='problem';
      svg.classList.toggle('problem-network',problem);
      container.dataset.layoutMode=options.layoutMode||'full';
      svg.setAttribute('aria-label',options.label);
      const markers=['inclusion','certified','structural','relaxation','reduction','selected'].map(kind=>'<marker id="'+prefix+kind+'" class="'+kind+'" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z"/></marker>').join('');
      const lines=layout.edges.map((edge,index)=>'<g class="network-relationship" role="button" tabindex="0" aria-pressed="false" aria-controls="'+id+'-edge-details" aria-label="'+esc(edgeTitle(edge))+'" data-network-edge="'+index+'" data-edge-source="'+esc(edge.source)+'" data-edge-target="'+esc(edge.target)+'"><path class="network-edge-hit" d="'+esc(edge.path)+'" aria-hidden="true"/><path class="network-edge '+(problem?'problem-edge ':'')+esc(edge.kind||'inclusion')+(edge.transitive?' transitive':'')+(edge.related===false?' unrelated':'')+'" data-source="'+esc(edge.source)+'" data-target="'+esc(edge.target)+'" d="'+esc(edge.path)+'" marker-end="url(#'+prefix+esc(edge.kind||'inclusion')+')" aria-hidden="true"/></g>').join('');
      const focusLabel=layout.nodes.find(n=>n.id===focusId)?.label||'';
      const nodes=layout.nodes.map(node=>'<a href="#explorer" '+(problem?'data-problem-focus':'data-class-focus')+'="'+esc(node.label)+'" aria-description="'+(problem?'Focus problem network on ':'Focus on ')+esc(node.label)+(options.layoutMode==='focused'?' · '+esc(node.id===focusId?'Selected class':node.column===0?'Contained in '+focusLabel:'Contains '+focusLabel):'')+(node.description?'. '+esc(node.description):'')+'"><g class="network-node'+(node.id===focusId?' selected':node.related===false?' unrelated':' related')+'" data-node-id="'+esc(node.id)+'" transform="translate('+node.x+' '+node.y+')"><rect width="'+node.width+'" height="'+node.height+'" rx="7"/><foreignObject width="'+node.width+'" height="'+node.height+'"><div xmlns="http://www.w3.org/1999/xhtml" class="network-node-label"><span class="network-node-label-content">'+labelHtml(node.label)+'</span></div></foreignObject></g></a>').join('');
      const columns=layout.columns?'<g class="network-column-headings" aria-hidden="true"><rect width="'+width+'" height="36"/>'+layout.columns.map(c=>'<text class="network-column-title" x="'+c.x+'" y="24" text-anchor="middle">'+esc(c.label)+'</text>').join('')+'</g>':'';
      svg.innerHTML='<defs>'+markers+'</defs><g class="network-camera">'+lines+nodes+'</g>'+columns;
      root.AtlasMath?.render(svg);
      syncSelection();
      container.style.setProperty('--network-print-ratio',layout.width+' / '+layout.height);
      container.querySelector('.network-count').textContent=layout.groupCounts?layout.groupCounts.contained+' contained · '+layout.groupCounts.containing+' containing':layout.nodes.length+(problem?' problems · ':' classes · ')+layout.edges.length+' links';
      resize();
      if(!camera){fit();if(camera.scale<0.66)center();}
      else if(previousFocus!==focusId)center();
      else update();
    }
    return {render:draw,fit,center};
  }
  root.AtlasNetwork={render};
})(typeof window!=='undefined'?window:globalThis);
