/* Finite sanity checks for elementary claims, plus their catalog scope guards.
 * These checks complement the displayed proofs; they are not general proofs. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../dist/core.js');
const catalog=require('../dist/data/catalog.json');
const papers=Object.fromEntries(catalog.papers.map(p=>[p.id,p]));
const byId=Object.fromEntries(catalog.results.map(r=>[r.id,r]));
const folkloreIds=['folklore-tree-mds','folklore-degree-mds','folklore-star-minor-mds','folklore-regular-vc','folklore-unitdisk-vc','pic-thesis-path-excluded-exact'];
function row(id){assert.ok(byId[id],'catalog entry exists: '+id);return byId[id];}
function popcount(value){let count=0;while(value){value&=value-1;count++;}return count;}
function graph(n,edges){
  const adjacency=Array(n).fill(0);
  for(const [u,v] of edges){adjacency[u]|=1<<v;adjacency[v]|=1<<u;}
  return {n,edges,adjacency,all:(1<<n)-1};
}
function dominates(g,mask){
  let covered=mask;
  for(let v=0;v<g.n;v++)if(mask&(1<<v))covered|=g.adjacency[v];
  return covered===g.all;
}
function minimum(g,valid){
  let best=g.n;
  for(let mask=0;mask<=g.all;mask++)if(popcount(mask)<best&&valid(mask))best=popcount(mask);
  return best;
}
const gamma=g=>minimum(g,mask=>dominates(g,mask));
const vertexCover=g=>minimum(g,mask=>g.edges.every(([u,v])=>(mask&(1<<u))||(mask&(1<<v))));
function innerVertexRule(g){
  let selected=0;
  for(let v=0;v<g.n;v++){
    const degree=popcount(g.adjacency[v]);
    const soleNeighbor=degree===1?Math.log2(g.adjacency[v]):-1;
    if(degree!==1||popcount(g.adjacency[soleNeighbor])===1)selected|=1<<v;
  }
  return selected;
}
function components(g){
  const result=[],seen=new Set();
  for(let start=0;start<g.n;start++)if(!seen.has(start)){
    const queue=[start];seen.add(start);
    let degreeSum=0;
    for(let i=0;i<queue.length;i++){
      const v=queue[i];degreeSum+=popcount(g.adjacency[v]);
      for(let u=0;u<g.n;u++)if((g.adjacency[v]&(1<<u))&&!seen.has(u)){seen.add(u);queue.push(u);}
    }
    result.push({vertices:queue.length,edges:degreeSum/2});
  }
  return result;
}
function treeFromPrufer(n,sequence){
  if(n===1)return graph(1,[]);
  const degree=Array(n).fill(1),edges=[];
  for(const v of sequence)degree[v]++;
  for(const v of sequence){
    const leaf=degree.findIndex(d=>d===1);
    edges.push([leaf,v]);degree[leaf]--;degree[v]--;
  }
  const remaining=degree.map((d,v)=>d===1?v:-1).filter(v=>v>=0);
  edges.push(remaining);
  return graph(n,edges);
}

test('the one-round forest construction dominates and is a 3-approximation on every labeled tree through six vertices',()=>{
  let checked=0;
  for(let n=1;n<=6;n++)for(let code=0;code<(n<=2?1:n**(n-2));code++){
    let value=code;
    const sequence=Array.from({length:Math.max(0,n-2)},()=>{const digit=value%n;value=Math.floor(value/n);return digit;});
    const g=treeFromPrufer(n,sequence),selected=innerVertexRule(g),optimum=gamma(g);
    assert.ok(dominates(g,selected),'feasible on tree n='+n+', Prüfer code='+code);
    assert.ok(popcount(selected)<=3*optimum,'factor 3 on tree n='+n+', Prüfer code='+code);
    checked++;
  }
  assert.equal(checked,1442);
  const tinyForest=graph(6,[[1,2],[3,4],[4,5]]),selected=innerVertexRule(tinyForest);
  assert.ok(selected&1,'the isolated vertex is selected');
  assert.ok((selected&6)===6,'both endpoints of the isolated edge are selected');
  assert.ok(dominates(tinyForest,selected));
  assert.ok(popcount(selected)<=3*gamma(tinyForest));
  const path=graph(30,Array.from({length:29},(_,i)=>[i,i+1]));
  const star=graph(30,Array.from({length:29},(_,i)=>[0,i+1]));
  assert.equal(popcount(innerVertexRule(path)),28);
  assert.ok(dominates(path,innerVertexRule(path))&&28<=3*Math.ceil(path.n/3));
  assert.equal(innerVertexRule(star),1);
});

test('pseudoforest MDS, degree-dependent MDS and regular vertex-cover bounds hold on all simple graphs through five vertices',()=>{
  let checked=0,regularChecked=0,pseudoforestsChecked=0,cyclicPseudoforestsChecked=0;
  for(let n=1;n<=5;n++){
    const possible=[];
    for(let u=0;u<n;u++)for(let v=u+1;v<n;v++)possible.push([u,v]);
    for(let edgeMask=0;edgeMask<2**possible.length;edgeMask++){
      const g=graph(n,possible.filter((_,i)=>edgeMask&(1<<i))),degrees=g.adjacency.map(popcount),delta=Math.max(...degrees);
      assert.ok(n<=(delta+1)*gamma(g),'taking all vertices is a (Delta+1)-approximation');
      const parts=components(g);
      if(parts.every(c=>c.edges<=c.vertices)){
        const selected=innerVertexRule(g);
        assert.ok(dominates(g,selected),'the one-round rule dominates every pseudoforest');
        assert.ok(popcount(selected)<=3*gamma(g),'factor 3 on pseudoforest n='+n+', edge mask='+edgeMask);
        pseudoforestsChecked++;
        if(parts.some(c=>c.edges===c.vertices))cyclicPseudoforestsChecked++;
      }
      if(delta>0&&degrees.every(d=>d===delta)){
        assert.ok(n<=2*vertexCover(g),'all vertices give factor 2 on a positive-degree regular graph');
        regularChecked++;
      }
      checked++;
    }
  }
  assert.equal(checked,1099);
  assert.ok(regularChecked>=20);
  assert.equal(pseudoforestsChecked,676);
  assert.equal(cyclicPseudoforestsChecked,337,'the exhaustive extension check includes cycles, not only forests');
  for(const g of [
    graph(3,[[0,1],[1,2],[2,0]]),
    graph(5,[[0,1],[1,2],[2,0],[0,3],[3,4]]),
    graph(9,[[0,1],[1,2],[2,0],[3,4],[4,5],[5,3],[6,7]])
  ]){
    assert.ok(components(g).every(c=>c.edges<=c.vertices));
    assert.ok(dominates(g,innerVertexRule(g)));
    assert.ok(popcount(innerVertexRule(g))<=3*gamma(g),'cycles with attached trees, mixed components and tiny components are covered');
  }
});

test('finite counterexamples show why pseudoforest and regular-graph restrictions must be retained',()=>{
  const bipartite=graph(10,Array.from({length:8},(_,i)=>[[0,i+2],[1,i+2]]).flat());
  assert.equal(gamma(bipartite),2);
  assert.ok(popcount(innerVertexRule(bipartite))>3*gamma(bipartite),'the internal-vertex rule is not a general-graph 3-approximation');
  const globallySparse=graph(7,[[0,1],[1,2],[2,0],[0,3],[3,4],[4,0],[5,6]]);
  assert.equal(globallySparse.edges.length,globallySparse.n);
  assert.ok(components(globallySparse).some(c=>c.edges>c.vertices));
  assert.equal(gamma(globallySparse),2);
  assert.ok(popcount(innerVertexRule(globallySparse))>3*gamma(globallySparse),'a global edge-count bound cannot replace the componentwise pseudoforest condition');
  const star=graph(5,[[0,1],[0,2],[0,3],[0,4]]);
  assert.equal(vertexCover(star),1);
  assert.ok(star.n>2*vertexCover(star),'taking all vertices needs the regularity hypothesis for factor 2');
});

test('folklore entries are searchable and keep explicit derivations and source provenance',()=>{
  for(const id of folkloreIds){
    const r=row(id);
    assert.equal(r.attribution,'folklore',id+' has an explicit attribution');
    assert.ok(typeof r.algorithm==='string'&&r.algorithm.length>20,id+' records the construction');
    assert.ok(typeof r.proofSketch==='string'&&r.proofSketch.length>20,id+' records the argument');
    assert.equal(r.verification,'primary',id+' has a checked source');
    assert.equal(new URL(r.sourceUrl).protocol,'https:');
  }
  const found=core.filtered(catalog.results,papers,{q:'folklore'});
  assert.deepEqual(found.filter(r=>r.verification!=='derived').map(r=>r.id).sort(),[...folkloreIds].sort());
  assert.ok(found.filter(r=>r.verification==='derived').every(r=>folkloreIds.includes(r.sourceResultId)),'derived folklore consequences retain the original baseline');
  const tree=row('folklore-tree-mds');
  assert.equal(tree.approximation,'3');
  assert.equal(tree.rounds,'1');
  assert.equal(tree.model,'CONGEST');
  assert.ok(/unweighted/i.test([tree.variant,tree.parameters,tree.assumptions].join(' ')));
  assert.ok(/forest case/i.test(tree.derivationNote),'the source theorem and elementary extension are distinguished');
});

test('folklore graph restrictions remain active in inclusion-aware catalog queries',()=>{
  const tree=row('folklore-tree-mds');
  assert.ok(core.matches(tree,{graph:'Trees'}));
  assert.ok(core.matches(tree,{graph:'Pseudoforests'}));
  assert.equal(core.matches(tree,{graph:'Planar'}),false,'a pseudoforest algorithm does not cover every planar graph');
  assert.equal(core.matches(tree,{graph:'General'}),false);
  for(const id of ['folklore-star-minor-mds','folklore-regular-vc']){
    const r=row(id),scope=core.resolveClass(r.graphScope.node);
    assert.ok(scope,id+' has an explicit graph-class node');
    assert.ok(core.matches(r,{graph:scope.label}),id+' applies to its exact family');
    for(const graph of ['General','Planar','Bounded degree'])assert.equal(core.matches(r,{graph}),false,id+' is not generalized to '+graph);
  }
  assert.ok(core.matches(row('folklore-unitdisk-vc'),{graph:'Unit-disk'}));
  assert.equal(core.matches(row('folklore-unitdisk-vc'),{graph:'Planar'}),false);
  assert.ok(core.matches(row('folklore-degree-mds'),{graph:'Bounded degree'}));
});
