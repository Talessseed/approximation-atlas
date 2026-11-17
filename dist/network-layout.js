(function(root){
  'use strict';
  const compare=(a,b)=>String(a)<String(b)?-1:String(a)>String(b)?1:0;
  const stable=value=>value&&typeof value==='object'?(Array.isArray(value)?'['+value.map(stable).join(',')+']':'{'+Object.keys(value).sort(compare).map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}'):JSON.stringify(value);
  const rounded=value=>Math.round(value*100)/100;

  function wrapLabel(label,width,measure,lineHeight){
    const text=String(label||'');
    const widthOf=part=>{
      const measured=measure?.(part);
      return typeof measured==='number'&&Number.isFinite(measured)?measured:Array.from(part).length*6.4;
    };
    const lines=[];let line='';
    for(const word of text.split(/\s+/).filter(Boolean)){
      const candidate=line?line+' '+word:word;
      if(widthOf(candidate)<=width){line=candidate;continue;}
      if(line){lines.push(line);line='';}
      // Long mathematical labels and identifiers still need to stay inside a node.
      for(const character of Array.from(word)){
        if(line&&widthOf(line+character)>width){lines.push(line);line='';}
        line+=character;
      }
    }
    if(line||!lines.length)lines.push(line);
    return {lines,height:Math.max(48,lines.length*lineHeight+24)};
  }

  function stronglyConnected(ids,outgoing){
    let index=0;const indices=new Map(),low=new Map(),stack=[],onStack=new Set(),groups=[];
    const visit=id=>{
      indices.set(id,index);low.set(id,index++);stack.push(id);onStack.add(id);
      for(const next of outgoing.get(id)){
        if(!indices.has(next)){visit(next);low.set(id,Math.min(low.get(id),low.get(next)));}
        else if(onStack.has(next))low.set(id,Math.min(low.get(id),indices.get(next)));
      }
      if(low.get(id)===indices.get(id)){
        const members=[];let member;
        do{member=stack.pop();onStack.delete(member);members.push(member);}while(member!==id);
        groups.push(members.sort(compare));
      }
    };
    for(const id of ids)if(!indices.has(id))visit(id);
    return groups.sort((a,b)=>compare(a[0],b[0]));
  }

  function layout(inputNodes,inputEdges,options={}){
    const nodeWidth=options.nodeWidth??220,nodeGap=options.nodeGap??26,layerGap=options.layerGap??100;
    const padding=options.padding??32,lineHeight=options.lineHeight??15,componentGap=options.componentGap??64;
    for(const value of [nodeWidth,nodeGap,layerGap,padding,lineHeight,componentGap])if(!Number.isFinite(value)||value<0)throw new Error('Network layout dimensions must be finite and nonnegative.');
    if(nodeWidth<24||lineHeight===0)throw new Error('Network nodes need a positive label area.');
    const nodes=inputNodes.map(node=>({...node,...wrapLabel(node.label,nodeWidth-28,options.measureLabel,lineHeight),width:nodeWidth})).sort((a,b)=>compare(a.id,b.id));
    const byId=new Map();
    for(const node of nodes){if(typeof node.id!=='string'||!node.id||byId.has(node.id))throw new Error('Network node IDs must be unique nonempty strings.');byId.set(node.id,node);}
    const edges=inputEdges.map(edge=>({...edge})).sort((a,b)=>compare(stable(a),stable(b)));
    const outgoing=new Map(nodes.map(n=>[n.id,new Set()])),adjacent=new Map(nodes.map(n=>[n.id,new Set()]));
    for(const edge of edges){
      if(!byId.has(edge.source)||!byId.has(edge.target))throw new Error('Unknown network edge endpoint: '+edge.source+' → '+edge.target);
      outgoing.get(edge.source).add(edge.target);adjacent.get(edge.source).add(edge.target);adjacent.get(edge.target).add(edge.source);
    }
    for(const [id,neighbors] of outgoing)outgoing.set(id,[...neighbors].sort(compare));
    if(!nodes.length)return {nodes:[],edges:[],components:[],width:2*padding,height:2*padding};

    const visited=new Set(),components=[];
    for(const node of nodes){
      if(visited.has(node.id))continue;
      const ids=[],queue=[node.id];visited.add(node.id);
      while(queue.length){const id=queue.shift();ids.push(id);for(const next of [...adjacent.get(id)].sort(compare))if(!visited.has(next)){visited.add(next);queue.push(next);}}
      components.push({ids:ids.sort(compare)});
    }
    for(const component of components){
      const ids=component.ids,idSet=new Set(ids),ownEdges=edges.filter(edge=>idSet.has(edge.source));
      const groups=stronglyConnected(ids,outgoing),groupOf=new Map();
      groups.forEach((group,i)=>group.forEach(id=>groupOf.set(id,i)));
      const groupOut=groups.map(()=>new Set()),indegree=groups.map(()=>0),ranks=groups.map(()=>0);
      for(const edge of ownEdges){const a=groupOf.get(edge.source),b=groupOf.get(edge.target);if(a!==b&&!groupOut[a].has(b)){groupOut[a].add(b);indegree[b]++;}}
      const pending=groups.map((_,i)=>i).filter(i=>!indegree[i]);
      while(pending.length){const a=pending.shift();for(const b of [...groupOut[a]].sort((a,b)=>a-b)){ranks[b]=Math.max(ranks[b],ranks[a]+1);if(!--indegree[b]){pending.push(b);pending.sort((a,b)=>a-b);}}}
      const layers=Array.from({length:Math.max(...ranks)+1},()=>[]),items=new Map();
      for(const id of ids){const node=byId.get(id),rank=ranks[groupOf.get(id)],item={id,node,rank,height:node.height,previous:[],next:[]};layers[rank].push(item);items.set(id,item);node.rank=rank;}
      const routes=new Map();
      ownEdges.forEach((edge,edgeIndex)=>{
        const source=items.get(edge.source),target=items.get(edge.target),route=[source];
        if(source.rank<target.rank){
          for(let rank=source.rank+1;rank<target.rank;rank++){
            const dummy={id:'\u0000edge-'+edgeIndex+'-'+rank,rank,height:6,previous:[],next:[],virtual:true};
            layers[rank].push(dummy);route.push(dummy);
          }
          route.push(target);
          for(let i=1;i<route.length;i++){route[i-1].next.push(route[i]);route[i].previous.push(route[i-1]);}
        }else route.push(target);
        routes.set(edge,route);
      });
      const order=(a,b)=>compare(a.node?.label||a.id,b.node?.label||b.id)||compare(a.id,b.id);
      layers.forEach(layer=>layer.sort(order));
      const updateOrder=()=>layers.forEach(layer=>layer.forEach((item,index)=>{item.order=index/Math.max(1,layer.length-1);}));
      updateOrder();
      for(let sweep=0;sweep<8;sweep++){
        const forwards=sweep%2===0;
        const sequence=forwards?layers:layers.slice().reverse();
        for(const layer of sequence){
          const values=new Map(layer.map(item=>{const neighbors=forwards?item.previous:item.next;return [item,neighbors.length?neighbors.reduce((sum,n)=>sum+n.order,0)/neighbors.length:item.order];}));
          layer.sort((a,b)=>values.get(a)-values.get(b)||a.order-b.order||order(a,b));updateOrder();
        }
      }
      const slotGap=(a,b)=>a.virtual||b.virtual?Math.min(nodeGap,14):nodeGap;
      const layerHeight=layer=>layer.reduce((total,item,i)=>total+item.height+(i?slotGap(layer[i-1],item):0),0);
      const tallest=Math.max(...layers.map(layerHeight));
      layers.forEach((layer,rank)=>{
        let top=(tallest-layerHeight(layer))/2;
        for(let i=0;i<layer.length;i++){
          const item=layer[i];if(i)top+=slotGap(layer[i-1],item);
          item.x=rank*(nodeWidth+layerGap);item.y=top;item.cy=top+item.height/2;
          if(item.node){item.node.x=item.x;item.node.y=item.y;}
          top+=item.height;
        }
      });
      const sameLayer=ownEdges.filter(e=>items.get(e.source).rank===items.get(e.target).rank);
      component.sideLanes=new Map(sameLayer.map(edge=>[edge,edge.source!==edge.target&&compare(edge.source,edge.target)>0&&sameLayer.some(other=>other.source===edge.target&&other.target===edge.source)?2:1]));
      component.width=layers.length*nodeWidth+(layers.length-1)*layerGap+(sameLayer.length?Math.max(...component.sideLanes.values())*Math.max(48,layerGap*.6):0);
      component.height=tallest;component.routes=routes;component.edges=ownEdges;
    }
    // Independent components share a canvas, but no visual edge is invented between them.
    components.sort((a,b)=>b.width*b.height-a.width*a.height||compare(a.ids[0],b.ids[0]));
    const targetWidth=Math.max(...components.map(c=>c.width),Math.sqrt(components.reduce((sum,c)=>sum+c.width*c.height,0)*2));
    let cursorX=0,cursorY=0,shelfHeight=0,width=0;
    for(const component of components){
      if(cursorX&&cursorX+component.width>targetWidth){cursorX=0;cursorY+=shelfHeight+componentGap;shelfHeight=0;}
      component.x=cursorX+padding;component.y=cursorY+padding;
      for(const id of component.ids){const node=byId.get(id);node.x=rounded(node.x+component.x);node.y=rounded(node.y+component.y);node.component=component.ids[0];}
      cursorX+=component.width+componentGap;shelfHeight=Math.max(shelfHeight,component.height);width=Math.max(width,cursorX-componentGap);
    }
    const geometry=[];
    for(const component of components)for(const edge of component.edges){
      const source=byId.get(edge.source),target=byId.get(edge.target),route=component.routes.get(edge);
      const point=(x,y)=>({x:rounded(x),y:rounded(y)}),points=[];let path;
      if(source.rank<target.rank){
        points.push(point(source.x+nodeWidth,source.y+source.height/2));
        for(const item of route.slice(1,-1)){const x=item.x+component.x,y=item.cy+component.y;points.push(point(x,y),point(x+nodeWidth,y));}
        points.push(point(target.x,target.y+target.height/2));
        path='M'+points[0].x+' '+points[0].y;
        for(let i=1;i<points.length;i++){
          const a=points[i-1],b=points[i];
          if(i%2===0&&i<points.length-1)path+=' L'+b.x+' '+b.y;
          else{const middle=rounded((a.x+b.x)/2);path+=' C'+middle+' '+a.y+' '+middle+' '+b.y+' '+b.x+' '+b.y;}
        }
      }else{
        const self=source.id===target.id;
        const a=point(source.x+nodeWidth,source.y+source.height*(self?.28:.5)),b=point(target.x+nodeWidth,target.y+target.height*(self?.72:.5));
        const bend=rounded(Math.max(a.x,b.x)+Math.max(48,layerGap*.6)*(component.sideLanes.get(edge)||1));
        points.push(a,b);path='M'+a.x+' '+a.y+' C'+bend+' '+a.y+' '+bend+' '+b.y+' '+b.x+' '+b.y;
      }
      geometry.push({...edge,path,points});
    }
    return {nodes,edges:geometry.sort((a,b)=>compare(stable({...a,path:undefined,points:undefined}),stable({...b,path:undefined,points:undefined}))),components:components.map(({ids,x,y,width,height})=>({ids,x,y,width,height})),width:rounded(width+2*padding),height:rounded(cursorY+shelfHeight+2*padding)};
  }
  function focused(inputNodes,inputEdges,focusId,options={}){
    const nodeWidth=options.nodeWidth??240,lineHeight=options.lineHeight??16;
    const padding=options.padding??28,gap=options.nodeGap??24,columnGap=options.layerGap??120,top=64;
    const prepared=layout(inputNodes,inputEdges,{...options,nodeWidth,lineHeight});
    const byId=new Map(prepared.nodes.map(n=>[n.id,n]));
    if(!byId.has(focusId))throw new Error('Unknown focused network node: '+focusId);
    const outgoing=new Map(prepared.nodes.map(n=>[n.id,[]]));
    for(const edge of inputEdges)outgoing.get(edge.source).push({...edge});
    for(const edges of outgoing.values())edges.sort((a,b)=>compare(a.target,b.target)||compare(stable(a),stable(b)));
    function path(from,to){
      const queue=[{nodes:[from],edges:[]}],seen=new Set([from]);
      while(queue.length){
        const current=queue.shift(),last=current.nodes.at(-1);
        if(last===to)return current;
        for(const edge of outgoing.get(last))if(!seen.has(edge.target)){
          seen.add(edge.target);queue.push({nodes:[...current.nodes,edge.target],edges:[...current.edges,edge]});
        }
      }
      return null;
    }
    const smaller=[],larger=[],proofs=new Map();
    for(const node of prepared.nodes){
      if(node.id===focusId)continue;
      const before=path(node.id,focusId),after=path(focusId,node.id);
      if(before){smaller.push(node);proofs.set(node.id,before);}
      else if(after){larger.push(node);proofs.set(node.id,after);}
    }
    const order=(a,b)=>compare(a.label,b.label)||compare(a.id,b.id);
    smaller.sort(order);larger.sort(order);
    const contentHeight=items=>items.reduce((sum,n)=>sum+n.height,0)+Math.max(0,items.length-1)*gap;
    const center=byId.get(focusId),bodyHeight=Math.max(220,contentHeight(smaller),contentHeight(larger),center.height);
    const positions=new Map();
    for(const [items,column] of [[smaller,0],[larger,2]]){
      let y=top+(bodyHeight-contentHeight(items))/2;
      for(const node of items){positions.set(node.id,{...node,x:padding+column*(nodeWidth+columnGap),y,rank:column,column});y+=node.height+gap;}
    }
    positions.set(focusId,{...center,x:padding+nodeWidth+columnGap,y:top+(bodyHeight-center.height)/2,rank:1,column:1});
    const edges=[];
    for(const node of [...smaller,...larger]){
      const proof=proofs.get(node.id),source=positions.get(proof.nodes[0]),target=positions.get(proof.nodes.at(-1));
      const direct=inputEdges.find(e=>e.source===source.id&&e.target===target.id);
      const a={x:source.x+source.width,y:source.y+source.height/2},b={x:target.x,y:target.y+target.height/2},middle=(a.x+b.x)/2;
      edges.push({...(direct||{}),source:source.id,target:target.id,kind:'inclusion',transitive:!direct,
        pathNodes:proof.nodes,description:(direct?'Direct inclusion: ':'Transitive inclusion: ')+proof.nodes.map(id=>byId.get(id).label).join(' ⊆ '),
        points:[a,b],path:'M'+a.x+' '+a.y+' C'+middle+' '+a.y+' '+middle+' '+b.y+' '+b.x+' '+b.y});
    }
    return {nodes:[...positions.values()].sort((a,b)=>a.column-b.column||a.y-b.y),edges,
      width:3*nodeWidth+2*columnGap+2*padding,height:top+bodyHeight+padding,
      columns:['Contained classes','Selected class','Containing classes'].map((label,column)=>({label,x:padding+column*(nodeWidth+columnGap)+nodeWidth/2})),
      groupCounts:{contained:smaller.length,containing:larger.length},components:[]};
  }
  const api={layout,focused};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.AtlasNetworkLayout=api;
})(typeof window!=='undefined'?window:globalThis);
