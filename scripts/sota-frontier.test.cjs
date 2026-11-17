const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../dist/core.js');
const catalog=require('../dist/data/catalog.json');
const byId=Object.fromEntries(catalog.results.map(result=>[result.id,result]));
const papers=Object.fromEntries(catalog.papers.map(paper=>[paper.id,paper]));
const policy=catalog.sotaFrontier;
const row=id=>{assert.ok(byId[id],'catalog fixture exists: '+id);return byId[id];};
const pair=(better,worse)=>policy.dominance.find(c=>c.better===better&&c.worse===worse);
const ids=state=>new Set(core.filtered(catalog.results,papers,state).map(result=>result.id));

test('strict dominance requires a complete certificate rather than a favorable single dimension',()=>{
  const dimensions=['problem','graphClass','approximation','rounds','model','randomness','benchmark','assumptions'];
  assert.deepEqual([...policy.dimensions].sort(),[...dimensions].sort());
  for(const comparison of policy.dominance){
    assert.deepEqual(Object.keys(comparison.conditions).sort(),[...dimensions].sort());
    assert.ok(comparison.strict.length>0,'a tie is not strict dominance');
    assert.ok(comparison.strict.every(dimension=>dimensions.includes(dimension)));
    assert.ok(Object.values(comparison.conditions).every(condition=>typeof condition==='string'&&condition.trim()));
    const better=row(comparison.better),worse=row(comparison.worse);
    assert.equal(better.bound,'upper');assert.equal(worse.bound,'upper');
    assert.equal(better.problemScope.node,worse.problemScope.node);
    assert.equal(better.objective,worse.objective);
    assert.equal(better.verification,'primary');
    assert.ok(!better.caveat&&better.status!=='claimed','an unresolved claim cannot remove a frontier point');
    assert.equal(new URL(comparison.evidenceUrl).protocol,'https:');
  }
});

test('the builder rejects unknown or slower round budgets as dominators of a fixed count',()=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const {spawnSync}=require('node:child_process');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-sota-fixed-rounds-'));
  try{
    fs.cpSync(path.join(__dirname,'../dist/data'),path.join(root,'dist/data'),{
      recursive:true,filter:source=>!['catalog.json','catalog.js'].includes(path.basename(source))
    });
    fs.mkdirSync(path.join(root,'scripts'));
    for(const name of ['build.py','derive.py','conditions.py','parameters.py','round_details.py'])fs.copyFileSync(path.join(__dirname,name),path.join(root,'scripts',name));
    const policyPath=path.join(root,'dist/data/sota-frontier.json');
    const sourcePolicy=JSON.parse(fs.readFileSync(policyPath,'utf8'));
    const fixture=sourcePolicy.dominance.find(c=>c.better==='wawrzyniak-planar-52'&&c.worse==='lenzen-planar-130');
    assert.ok(fixture,'the same-six-round historical improvement is the valid source fixture');
    for(const [better,worse] of [
      ['gen-asw26-planar','lenzen-planar-130'],
      ['wawrzyniak-planar-52','folklore-tree-mds']
    ]){
      const invalid={...fixture,better,worse};
      const candidate={...sourcePolicy,dominance:[...sourcePolicy.dominance.filter(c=>c.better!==better||c.worse!==worse),invalid]};
      fs.writeFileSync(policyPath,JSON.stringify(candidate));
      const output=spawnSync('python3',['-B',path.join(root,'scripts/build.py')],{encoding:'utf8'});
      assert.notEqual(output.status,0,better+' cannot dominate the fixed round count of '+worse);
      assert.match(output.stderr,/Fixed-round dominance needs a verified no-larger numerical budget/);
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('global dominance is not undone when a filter hides its better result',()=>{
  const planar=row('gen-asw26-planar'),broader=row('gen-asw26-minordensity');
  assert.ok(planar.sota,'historical evidence is retained');
  assert.ok(planar.dominatedBy.includes(broader.id));
  assert.equal(core.sotaContext(planar,{}).status,'dominated');
  const exact={problem:'MDS',graph:'Planar',classTransfer:false};
  assert.ok(ids(exact).has(planar.id),'the historical result remains available');
  assert.equal(ids(exact).has(broader.id),false,'exact-family mode hides the containing-class theorem');
  assert.equal(core.sotaApplies(planar,exact),false);
  assert.equal(ids({...exact,sota:true}).has(planar.id),false,'hiding a dominator cannot restore SOTA');
  const old=row('lenzen-planar-130'),paperOnly={paper:old.paperId};
  assert.ok(ids(paperOnly).has(old.id));
  assert.equal(ids(paperOnly).has('gen-asw26-planar'),false);
  assert.equal(core.sotaContext(old,paperOnly).status,'dominated');
  assert.equal(ids({...paperOnly,sota:true}).has(old.id),false);
});

test('the broader factor-seven point has a parameter and protocol identity certificate',()=>{
  const certificate=pair('gen-asw26-minordensity','gen-asw26-planar');
  assert.ok(certificate);assert.deepEqual(certificate.strict,['graphClass']);
  assert.equal(certificate.parameterSubstitution,'a=3');
  assert.equal(certificate.domainGuard,undefined,'the substitution covers every planar input');
  assert.ok(certificate.conditions.rounds.includes('1/294'),'same solver accuracy is part of the certificate');
  assert.ok(/same protocol|same W, R and H/i.test(certificate.conditions.rounds));
  assert.ok(core.inclusionPath('Planar',row('gen-asw26-minordensity').graphScope.node));
  const context=core.sotaContext(row('gen-asw26-minordensity'),{problem:'MDS',graph:'Planar'});
  assert.equal(context.status,'frontier');
  assert.equal(context.transfer.scopeLabel,'Planar · a=3');
  assert.ok(context.transfer.setting.includes('7'));
  const visible=ids({problem:'MDS',graph:'Planar',sota:true});
  assert.ok(visible.has('gen-asw26-minordensity'));
  assert.equal(visible.has('gen-asw26-planar'),false);
});

test('SOTA inheritance requires an explicit certificate for the requested graph and problem together',()=>{
  const cover=row('gen-asw26-cover-det');
  const certified=core.sotaContext(cover,{problem:'MDS',graph:'Planar'});
  assert.equal(certified.status,'frontier');
  assert.equal(certified.transfer.scopeLabel,'Planar MDS · log-star');
  assert.ok(certified.transfer.setting.includes('C(v)=N[v]'));
  assert.equal(core.sotaContext(cover,{problem:'MDS'}).status,'source-only','a Planar certificate is not a generic MDS certificate');
  assert.equal(core.sotaContext(cover,{problem:'Total dominating set',graph:'Planar'}).status,'source-only');
  assert.equal(core.sotaContext(row('gen-asw26-minordensity'),{graph:'Trees'}).status,'source-only','integer-a certification is not silently instantiated at a=1');
  assert.equal(core.sotaContext(row('gen-asw26-genus'),{graph:'Planar'}).status,'source-only','an unreviewed inherited setting is not promoted');
});

test('the one-round pseudoforest point retains its certified forest specialization',()=>{
  const folklore=row('folklore-tree-mds');
  assert.equal(folklore.rounds,'1');assert.equal(folklore.approximation,'3');
  assert.equal(folklore.graphScope.node,'pseudoforest');
  assert.equal(core.sotaContext(folklore,{}).status,'frontier');
  const context=core.sotaContext(folklore,{problem:'MDS',graph:'Trees'});
  assert.equal(context.status,'frontier');
  assert.equal(context.transfer.scopeLabel,'Forests · one round');
  assert.equal(core.sotaApplies(folklore,{graph:'Planar'}),false);
  assert.ok(!folklore.dominatedBy?.length,'an unspecified constant does not imply at most one round');
});

test('exact k, 3k, three-round and parameter-uniform tradeoffs are not collapsed to Constant',()=>{
  assert.equal(core.sotaApplies(row('pic-girth-pruning')),true);
  assert.equal(core.sotaApplies(row('pic-girth-sublinear')),true);
  const expected={
    'pic-girth-pruning':'k',
    'pic-girth-sublinear':'3k',
    'pic-large-linear-dom':'3',
    'pic-large-linear-vc':'3',
    'folklore-tree-mds':'1'
  };
  for(const [id,rounds] of Object.entries(expected)){
    assert.equal(row(id).rounds,rounds);
    assert.ok(!row(id).dominatedBy?.length,id+' retains its exact-round tradeoff');
  }
  for(const [a,b] of [['pic-girth-pruning','pic-girth-sublinear'],['pic-large-linear-dom','pic-large-50-dom'],['pic-large-linear-vc','pic-large-50-vc']]){
    assert.equal(pair(a,b),undefined);assert.equal(pair(b,a),undefined,'neither full parameter function is certified no worse');
  }
});

test('the certified broader family supplies the K2t factor-50 frontier with explicit parameter and search scopes',()=>{
  const result=row('pic-thesis-pw2-dom'),original=row('pic-large-50-dom');
  const state={problem:'MDS',graph:'K₂,t-minor-free',round:'parameter',sota:true};
  assert.equal(result.approximationDisplay,'50');
  assert.equal(result.roundsDisplay,'f(H)','the generic theorem retains its own excluded-minor dependence');
  assert.equal(original.roundsDisplay,'O(t)','the original parameter dependence is expanded after the source audit');
  assert.equal(core.effectiveRounds(result,state).roundsDisplay,'O(t)','the certified K2t instance reuses the original runtime');
  assert.equal(core.sotaContext(result,state).status,'frontier');
  assert.ok(ids(state).has(result.id),'the SOTA-only parameter-dependent view includes the family extension');
  assert.equal(ids(state).has(original.id),false,'the covered special case does not duplicate its broader certificate');
  assert.equal(ids({...state,round:'constant'}).has(result.id),false,'O(t) is not a universal constant round complexity');
  assert.equal(core.tightApplies(result,state),false,'best known does not imply a matching lower bound');
  assert.ok(core.sotaContext(result,state).transfer.scopeLabel.includes('t ≥ 49'),'the certified large-t range is visible');
  for(const q of ['K2t MDS','K_{2,t}-minor-free MDS']){
    assert.equal(core.searchContext({q}).target?.id,'k2t',q+' recognizes the exact graph class');
    assert.ok(ids({q,round:'parameter',sota:true}).has(result.id),q+' retains the certified broader factor-50 entry');
    assert.equal(core.effectiveRounds(result,{q}).roundsDisplay,'O(t)','search and explicit graph queries instantiate the same runtime');
  }
});

test('the thesis factor-50 extension covers the original through a reviewed algorithm-family specialization, not a speedup',()=>{
  const original=row('pic-large-50-dom'),broader=row('pic-thesis-pw2-dom');
  const specialization=policy.algorithmSpecializations.find(entry=>entry.resultId===broader.id&&entry.sourceResultId===original.id&&entry.graph==='k2t');
  assert.ok(specialization,'the family specialization is an explicit reviewed certificate');
  assert.deepEqual(specialization.parameterBindings,{'excluded-minor':'K₂,t'});
  assert.ok(specialization.reason&&specialization.evidence?.length,'the identity has primary-source evidence');
  assert.ok(broader.algorithmFamily&&broader.algorithmFamily===original.algorithmFamily,'both entries identify the same algorithm family');
  assert.equal(core.sotaApplies(broader,{graph:'minor-pw2',round:'parameter'}),true);
  const context=core.sotaContext(broader,{graph:'K2t'});
  assert.equal(context.status,'frontier');
  assert.equal(context.transfer.algorithmSpecialization,specialization.id);
  assert.equal(core.sotaContext(original,{graph:'K2t'}).status,'dominated');
  assert.equal(pair(original.id,broader.id),undefined);
  const extension=pair(broader.id,original.id);
  assert.ok(extension);assert.equal(extension.kind,'family-extension');
  assert.equal(extension.algorithmSpecialization,specialization.id);
  assert.deepEqual(extension.strict,['graphClass'],'coverage is the only strict improvement');
  assert.ok(original.dominatedBy.includes(broader.id));
  assert.equal(core.tightApplies(broader),false,'a uniform factor 50 is not a matching lower bound');
});

test('excluding containing classes cannot restore SOTA to the covered K2t special case',()=>{
  const original=row('pic-large-50-dom'),broader=row('pic-thesis-pw2-dom');
  const exact={problem:'MDS',graph:'K2t',classTransfer:false};
  assert.ok(ids(exact).has(original.id),'the historical special case remains visible');
  assert.equal(ids(exact).has(broader.id),false,'the containing theorem is hidden in exact-class mode');
  assert.equal(core.sotaApplies(original,exact),false);
  assert.equal(ids({...exact,sota:true}).has(original.id),false,'hiding the family extension does not restore its covered instance');
  assert.equal(ids({...exact,sota:true}).has(broader.id),false);
  assert.equal(core.effectiveRounds(broader,exact).roundsDisplay,'f(H)','an inapplicable specialization does not replace the generic formula');
});

test('excluded-minor bindings carry semantic roles and preserve the one-way family inclusion',()=>{
  const broader=row('pic-thesis-pw2-dom'),state={graph:'K2t'};
  const edge=core.graphNetwork.edges.find(edge=>edge.subset==='k2t'&&edge.superset==='minor-pw2');
  assert.ok(edge);assert.equal(edge.lower,false);
  assert.deepEqual(edge.parameterBindings,{'excluded-minor':'K₂,t'});
  assert.deepEqual(broader.graphParameterRoles,{'excluded-minor':'H'});
  const match=core.graphMatch(broader,state);
  assert.equal(match.matches,true);assert.equal(match.inherited,true);
  assert.deepEqual(match.parameterBindings,{'excluded-minor':{symbol:'H',value:'K₂,t'}});
  assert.equal(core.classMatch({...row('pic-large-50-dom'),bound:'lower'},'minor-pw2').matches,false,'an existential excluded-minor choice cannot transfer a lower bound to every H');
  const density=core.graphMatch(row('gen-asw26-minordensity'),state);
  assert.equal(density.matches,true);
  assert.deepEqual(density.parameterBindings||{},{},'H for an arbitrary minor is not the excluded-minor parameter');
});

test('query-specific runtime identity preserves source fields and does not leak beyond its certificate',()=>{
  const broader=row('pic-thesis-pw2-dom'),original=row('pic-large-50-dom');
  const before=JSON.stringify(broader),sourceBefore=JSON.stringify(original);
  const effective=core.effectiveRounds(broader,{graph:'K2t'});
  assert.equal(effective.roundsDisplay,'O(t)');
  assert.equal(effective.roundClass,'parameter');
  for(const field of ['formula','tex','status'])assert.equal(effective.roundComplexityDetails[field],original.roundComplexityDetails[field],'the mapped runtime preserves source '+field);
  assert.equal(effective.roundComplexityDetails.basis,'same-algorithm-specialization');
  assert.equal(effective.roundComplexityDetails.sourceBasis,original.roundComplexityDetails.basis);
  assert.equal(effective.roundComplexityDetails.derivedFrom,original.id);
  for(const evidence of original.roundComplexityDetails.evidence)assert.ok(effective.roundComplexityDetails.evidence.some(item=>item.url===evidence.url&&item.location===evidence.location),'original round evidence remains linked');
  assert.ok(effective.specialization,'the displayed bound retains its certificate');
  for(const state of [{},{graph:'minor-pw2'},{graph:'path-minor'},{graph:'K2t',classTransfer:false}]){
    const uninstantiated=core.effectiveRounds(broader,state);
    assert.equal(uninstantiated.roundsDisplay,'f(H)',JSON.stringify(state));
    assert.equal(uninstantiated.specialization,null,JSON.stringify(state));
  }
  const uncertified={...broader,sotaScopeTransfers:[]};
  assert.equal(core.effectiveRounds(uncertified,{graph:'K2t'}).roundsDisplay,'f(H)','matching graph topology and function notation alone are not an algorithm identity certificate');
  assert.equal(JSON.stringify(broader),before);assert.equal(JSON.stringify(original),sourceBefore);
  for(const id of ['pic-large-50-dom','pic-large-50-vc']){
    const r=row(id);assert.equal(r.rounds,'Oₜ(1)');assert.equal(r.roundsDisplay,'O(t)');
    assert.equal(r.roundClass,'parameter');assert.equal(r.roundComplexityDetails.displayInTable,true);
  }
});

test('family coverage is rejected without its reviewed protocol identity and matching parameterized inclusion',()=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const {spawnSync}=require('node:child_process');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-sota-family-'));
  try{
    fs.cpSync(path.join(__dirname,'../dist/data'),path.join(temporary,'dist/data'),{recursive:true,filter:source=>!['catalog.json','catalog.js'].includes(path.basename(source))});
    fs.mkdirSync(path.join(temporary,'scripts'));
    for(const name of ['build.py','derive.py','conditions.py','parameters.py','round_details.py'])fs.copyFileSync(path.join(__dirname,name),path.join(temporary,'scripts',name));
    const policyPath=path.join(temporary,'dist/data/sota-frontier.json'),sourcePath=path.join(temporary,'dist/data/picavet.json');
    const sourcePolicy=JSON.parse(fs.readFileSync(policyPath,'utf8')),sourceData=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
    const certificate=sourcePolicy.algorithmSpecializations.find(entry=>entry.resultId==='pic-thesis-pw2-dom'&&entry.sourceResultId==='pic-large-50-dom');
    assert.ok(certificate);
    const cases=[
      {name:'missing protocol certificate',pattern:/Family coverage requires an explicit same-algorithm specialization/,change:(policy,data)=>{delete policy.dominance.find(entry=>entry.algorithmSpecialization===certificate.id).algorithmSpecialization;}},
      {name:'unmapped excluded minor',pattern:/Algorithm specialization needs its parameterized inclusion/,change:(policy,data)=>{policy.algorithmSpecializations.find(entry=>entry.id===certificate.id).parameterBindings={'excluded-minor':'K₃,t'};}},
      {name:'different protocol family',pattern:/Algorithm specialization needs a shared protocol family/,change:(policy,data)=>{data.results.find(entry=>entry.id===certificate.sourceResultId).algorithmFamily='unrelated-algorithm';}},
    ];
    for(const item of cases){
      const policy=structuredClone(sourcePolicy),data=structuredClone(sourceData);item.change(policy,data);
      fs.writeFileSync(policyPath,JSON.stringify(policy));fs.writeFileSync(sourcePath,JSON.stringify(data));
      const output=spawnSync('python3',['-B',path.join(temporary,'scripts/build.py')],{encoding:'utf8'});
      assert.notEqual(output.status,0,item.name+' cannot remove a frontier point');assert.match(output.stderr,item.pattern,item.name);
    }
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});

test('fractional benchmarks, fractional outputs and integral outputs remain distinct frontier dimensions',()=>{
  const density=row('gen-asw26-minordensity'),genus=row('gen-asw26-genus');
  assert.equal(core.sotaApplies(density,{}),true);
  assert.equal(core.sotaApplies(genus,{}),true);
  assert.equal(pair(density.id,genus.id),undefined);
  assert.equal(pair(genus.id,density.id),undefined,'a larger class at integral OPT does not dominate a fractional benchmark');
  const fractional=row('gen-asw26-fractional'),integral=row('gen-asw26-cover-det');
  assert.notEqual(fractional.problemScope.node,integral.problemScope.node);
  assert.equal(pair(fractional.id,integral.id),undefined);
  assert.equal(pair(integral.id,fractional.id),undefined,'LP feasibility does not supply an integral approximation');
});

test('weighted/cardinality and deterministic/randomized tradeoffs survive unless all dimensions are certified',()=>{
  for(const id of ['gen-hs22-mwm','gen-iky25-matching','gen-asw26-cover-random','gen-asw26-cover-det'])assert.equal(core.sotaApplies(row(id),{}),true,id);
  for(const [a,b] of [['gen-hs22-mwm','gen-iky25-matching'],['gen-asw26-cover-random','gen-asw26-cover-det']]){
    assert.equal(pair(a,b),undefined);assert.equal(pair(b,a),undefined);
  }
  assert.ok(row('gen-asw26-cover-random').approximation.includes('expectation'));
  assert.equal(row('gen-asw26-cover-det').randomization,'Deterministic');
  assert.notEqual(row('gen-asw26-cover-random').roundClass,row('gen-asw26-cover-det').roundClass);
});

test('a conditional parameter comparison is retained as evidence without globally pruning a row',()=>{
  const certificate=pair('folklore-degree-mds','folklore-star-minor-mds');
  assert.ok(certificate);assert.equal(certificate.domainGuard,'t ≥ 4');
  assert.ok(certificate.parameterDomain.includes('Δ ≤ t−1'));
  const star=row('folklore-star-minor-mds');
  assert.ok(star.frontierComparisons.some(c=>c.domainGuard==='t ≥ 4'));
  assert.ok(!star.dominatedBy?.length);
  assert.notEqual(core.sotaContext(star,{}).status,'dominated');
  const reviewed={...star,sota:{setting:'A hypothetical independently reviewed parameter scope'}};
  assert.equal(core.sotaContext(reviewed,{}).status,'frontier','a guarded comparison alone cannot suppress an independently reviewed scope');
});

test('partial parameter certifications remain explicit rather than claiming the entire row is optimal',()=>{
  const density=core.sotaContext(row('gen-asw26-minordensity'),{});
  assert.equal(density.annotation.scopeLabel,'Integer a ≥ 2');
  assert.ok(density.annotation.setting.includes('integer a ≥ 2'));
  assert.ok(/noninteger/i.test(density.annotation.reason));
  const multiplicity=core.sotaContext(row('planar-k-dom-trivial'),{});
  assert.ok(multiplicity.annotation.scopeLabel.includes('k ∈ {3,4,5,6}'));
  assert.ok(multiplicity.annotation.reason.includes('does not extend'));
});

test('unknown comparisons do not certify SOTA and lower-bound frontiers use their own evidence',()=>{
  const unknown=row('pic-large-linear-dom');
  assert.ok(!unknown.sota&&!unknown.dominatedBy?.length);
  assert.equal(core.sotaContext(unknown,{}).status,'unreviewed');
  assert.equal(core.matches(unknown,{sota:true}),false,'absence of a dominator is not a literature certificate');
  for(const id of ['gen-asw26-cycle-lower','gen-fk25-path-lower','gen-ghs12-eds']){
    assert.equal(row(id).bound,'lower');
    assert.equal(core.sotaContext(row(id),{}).status,'frontier');
    assert.ok(!policy.dominance.some(c=>c.better===id||c.worse===id),'upper-bound Pareto ordering is not reused for lower bounds');
  }
});

test('the genus-independent distance-k guarantee is SOTA in its parameter-round setting',()=>{
  const result=row('pic-thesis-genus-distance-dom');
  assert.equal(result.approximationDisplay,'k^{O(k)}');
  assert.equal(result.roundsDisplay,'f(g, k)');
  assert.equal(result.roundClass,'parameter','genus-dependent rounds are not a universal constant');
  assert.equal(result.constantApproximation,false,'the approximation still depends on distance k');
  assert.equal(core.sotaContext(result,{}).status,'frontier');
  for(const state of [
    {problem:'Distance-k dominating set',graph:'Euler genus ≤ g',round:'parameter'},
    {q:'bounded genus distance-k dominating set',round:'parameter'},
    {paper:result.paperId,model:'LOCAL'}
  ])assert.ok(ids({...state,sota:true}).has(result.id),'the source point survives its relevant SOTA filters');
  assert.equal(ids({sota:true,constantRatio:true}).has(result.id),false);
  assert.equal(ids({sota:true,round:'constant'}).has(result.id),false);
  assert.equal(core.sotaApplies(result,{graph:'Planar'}),false,'applicability on a subclass alone is not a SOTA certificate');
  assert.equal(core.sotaApplies(result,{problem:'MDS'}),false,'a generic distance-k certificate does not assert the best k=1 coefficient');
  assert.ok(!result.dominatedBy?.length);
  assert.equal(core.tightApplies(result,{}),false,'best known does not imply tight');
});

test('historical annotations and active frontier counts remain distinguishable',()=>{
  const annotations=catalog.results.filter(result=>result.sota);
  const frontier=catalog.results.filter(result=>core.sotaApplies(result,{}));
  assert.equal(annotations.length,46);
  assert.equal(frontier.length,41);
  assert.ok(annotations.some(result=>result.id==='gen-asw26-planar'));
  assert.equal(frontier.some(result=>result.id==='gen-asw26-planar'),false);
  assert.deepEqual(ids({sota:true}),new Set(frontier.map(result=>result.id)));
});
