const {test}=require('node:test');
const assert=require('node:assert/strict');
const {layout,focused}=require('../dist/network-layout.js');
const graph=require('../dist/data/graph-classes.json'),problems=require('../dist/data/problems.json');
const graphEdges=graph.edges.map(e=>({...e,source:e.subset,target:e.superset}));
const problemEdges=problems.edges.map(e=>({...e,source:e.special,target:e.general}));
const key=edge=>edge.source+'→'+edge.target;
function checkGeometry(result){
  const nodes=new Map(result.nodes.map(n=>[n.id,n]));
  assert.ok(Number.isFinite(result.width)&&Number.isFinite(result.height));
  for(const node of result.nodes){
    for(const field of ['x','y','width','height'])assert.ok(Number.isFinite(node[field]),node.id+' '+field);
    assert.ok(node.x>=0&&node.y>=0&&node.x+node.width<=result.width+.01&&node.y+node.height<=result.height+.01,node.id+' inside canvas');
    assert.ok(node.lines.length>0);
  }
  for(let i=0;i<result.nodes.length;i++)for(let j=i+1;j<result.nodes.length;j++){
    const a=result.nodes[i],b=result.nodes[j];
    assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'overlap '+a.id+' '+b.id);
  }
  for(const edge of result.edges){
    assert.match(edge.path,/^M[-\d.]+ [-\d.]+ C/);assert.doesNotMatch(edge.path,/NaN|Infinity|undefined/);
    const source=nodes.get(edge.source),target=nodes.get(edge.target),start=edge.points[0],end=edge.points.at(-1);
    assert.equal(start.x,source.x+source.width);assert.ok(start.y>source.y&&start.y<source.y+source.height);
    assert.ok(end.x===target.x||end.x===target.x+target.width);assert.ok(end.y>target.y&&end.y<target.y+target.height);
  }
}
for(const [name,nodes,edges] of [['graph classes',graph.nodes,graphEdges],['problems',problems.nodes,problemEdges]]){
  test(name+': every recorded node and edge survives without transitive fabrication',()=>{
    const result=layout(nodes,edges);checkGeometry(result);
    assert.deepEqual(result.nodes.map(n=>n.id).sort(),nodes.map(n=>n.id).sort());
    assert.deepEqual(result.edges.map(key).sort(),edges.map(key).sort());
    for(const edge of result.edges){const original=edges.find(e=>key(e)===key(edge));assert.equal(edge.reason,original.reason);}
    assert.ok(new Set(result.nodes.map(n=>n.x)).size>3,'multiple actual hierarchy levels');
  });
  test(name+': layout is deterministic and independent of input ordering',()=>{
    assert.deepEqual(layout(nodes,edges),layout(nodes.slice().reverse(),edges.slice().reverse()));
  });
}
test('branching chains retain their own direct arcs rather than a selected-node star',()=>{
  const nodes=['a','b','c','d','e'].map(id=>({id,label:id}));
  const edges=[{source:'a',target:'c'},{source:'b',target:'c'},{source:'c',target:'d'},{source:'d',target:'e'},{source:'a',target:'e'}];
  const result=layout(nodes,edges);checkGeometry(result);
  const positions=new Map(result.nodes.map(n=>[n.id,n]));
  assert.equal(positions.get('a').x,positions.get('b').x);
  for(const [a,b] of [['a','c'],['c','d'],['d','e']])assert.ok(positions.get(a).x<positions.get(b).x);
  assert.ok(result.edges.find(e=>e.source==='a'&&e.target==='e').points.length>2,'long edge routes through intermediate layers');
});
test('long labels and unbroken identifiers grow node height without losing text',()=>{
  const label='Asymptotic dimension d; sufficiently large-radius neighborhoods of Euler genus ≤ g';
  const result=layout([{id:'a',label},{id:'b',label:'a'.repeat(90)}],[]);
  checkGeometry(result);
  assert.equal(result.nodes[0].lines.join(' '),label);
  assert.equal(result.nodes[1].lines.join(''),'a'.repeat(90));
  assert.ok(result.nodes.every(n=>n.height>48));
});
test('isolated and disconnected nodes remain disconnected',()=>{
  const result=layout(['a','b','c','d','e'].map(id=>({id,label:id})),[{source:'a',target:'b'},{source:'c',target:'d'}]);
  checkGeometry(result);assert.equal(result.components.length,3);assert.equal(result.edges.length,2);
  assert.ok(result.components.some(c=>c.ids.length===1&&c.ids[0]==='e'));
});
test('cycles and self-loops yield finite boundary-to-boundary routes',()=>{
  const result=layout(['a','b','c','d'].map(id=>({id,label:id})),[{source:'a',target:'b'},{source:'b',target:'a'},{source:'b',target:'c'},{source:'c',target:'c'}]);
  checkGeometry(result);assert.equal(result.edges.length,4);
  const forwards=result.edges.find(e=>e.source==='a'&&e.target==='b'),backwards=result.edges.find(e=>e.source==='b'&&e.target==='a');
  assert.notEqual(forwards.path.split(' C')[1].split(' ')[0],backwards.path.split(' C')[1].split(' ')[0],'reciprocal edges use distinct selectable lanes');
  assert.equal(result.nodes.find(n=>n.id==='a').rank,result.nodes.find(n=>n.id==='b').rank);
  assert.ok(result.nodes.find(n=>n.id==='c').rank>result.nodes.find(n=>n.id==='b').rank);
});
test('empty data is safe and invalid references fail clearly',()=>{
  assert.deepEqual(layout([],[]),{nodes:[],edges:[],components:[],width:64,height:64});
  assert.throws(()=>layout([{id:'a',label:'A'}],[{source:'a',target:'missing'}]),/Unknown network edge endpoint/);
  assert.throws(()=>layout([{id:'a'},{id:'a'}],[]),/unique nonempty/);
  assert.throws(()=>layout([{id:'a'}],[],{nodeWidth:Infinity}),/finite/);
});
test('label measurement can use actual font widths',()=>{
  const result=layout([{id:'a',label:'WWW WWW WWW'}],[],{nodeWidth:80,measureLabel:text=>text.length*10});
  assert.deepEqual(result.nodes[0].lines,['WWW','WWW','WWW']);checkGeometry(result);
});

function inclusionPath(edges,from,to){
  const queue=[[from]],seen=new Set([from]);
  while(queue.length){const path=queue.shift(),last=path.at(-1);if(last===to)return path;for(const edge of edges)if(edge.source===last&&!seen.has(edge.target)){seen.add(edge.target);queue.push([...path,edge.target]);}}
  return null;
}
test('focused graph classes contain exactly the focus and its contained and containing classes',()=>{
  for(const focus of graph.nodes){
    const result=focused(graph.nodes,graphEdges,focus.id);checkGeometry(result);
    const expected=graph.nodes.filter(node=>inclusionPath(graphEdges,node.id,focus.id)||inclusionPath(graphEdges,focus.id,node.id));
    assert.deepEqual(result.nodes.map(node=>node.id).sort(),expected.map(node=>node.id).sort(),focus.id);
    const center=result.nodes.find(node=>node.id===focus.id);assert.ok(center);
    for(const column of [0,2]){
      const group=result.nodes.filter(node=>node.column===column);
      if(!group.length)continue;
      const top=Math.min(...group.map(node=>node.y)),bottom=Math.max(...group.map(node=>node.y+node.height));
      assert.ok(Math.abs((top+bottom)/2-(center.y+center.height/2))<.01,'column '+column+' is vertically centered on '+focus.id);
    }
    for(const node of result.nodes)if(node.id!==focus.id){
      if(inclusionPath(graphEdges,node.id,focus.id))assert.ok(node.x<center.x,node.id+' is left of '+focus.id);
      else assert.ok(node.x>center.x,node.id+' is right of '+focus.id);
    }
    assert.equal(result.edges.length,result.nodes.length-1,'one focused inclusion per related class');
  }
});
test('focused arrows distinguish direct inclusions from transitive paths without altering source data',()=>{
  const before=JSON.stringify({nodes:graph.nodes,edges:graphEdges}),result=focused(graph.nodes,graphEdges,'planar');
  let direct=0,transitive=0;
  for(const edge of result.edges){
    assert.ok(edge.source==='planar'||edge.target==='planar','each arrow is a focus-centered inclusion summary');
    assert.ok(inclusionPath(graphEdges,edge.source,edge.target),'every summary has a genuine directed inclusion path');
    const original=graphEdges.find(source=>key(source)===key(edge));
    assert.equal(edge.transitive,!original,'only unrecorded transitive summaries are dashed');
    if(original){direct++;assert.equal(edge.reason,original.reason);assert.equal(edge.lower,original.lower);}else transitive++;
  }
  assert.ok(direct>0&&transitive>0,'the real planar diagram exercises both line styles');
  assert.equal(JSON.stringify({nodes:graph.nodes,edges:graphEdges}),before,'focused summaries never modify recorded graph topology or bindings');
});
test('focused layout is deterministic, keeps all labels, and grows boxes for long names',()=>{
  const label='Asymptotic dimension d; sufficiently large-radius neighborhoods of Euler genus ≤ g';
  const nodes=[{id:'a',label},{id:'b',label:'a'.repeat(90)},{id:'c',label:'Selected class'},{id:'unrelated',label:'Unrelated'}],edges=[{source:'a',target:'c'},{source:'c',target:'b'}];
  const result=focused(nodes,edges,'c');checkGeometry(result);
  assert.deepEqual(result,focused(nodes.slice().reverse(),edges.slice().reverse(),'c'));
  assert.equal(result.nodes.find(node=>node.id==='a').lines.join(' '),label);
  assert.equal(result.nodes.find(node=>node.id==='b').lines.join(''),'a'.repeat(90));
  assert.ok(result.nodes.find(node=>node.id==='a').height>48);
  assert.equal(result.nodes.some(node=>node.id==='unrelated'),false);
});
