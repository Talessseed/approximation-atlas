const {test} = require('node:test');
const assert = require('node:assert/strict');
const core = require('../dist/core.js');
const upper = {id:'a',problem:'Vertex cover',model:'CONGEST',bound:'upper',graphClass:'General graphs',roundClass:'degree',year:2020,randomization:'Deterministic',verification:'primary',paperId:'p'};
test('model transfer follows opposite directions for upper and lower bounds',()=>{
  assert.equal(core.matches(upper,{model:'LOCAL',transfer:true}),true);
  assert.equal(core.matches(upper,{model:'LOCAL',transfer:false}),false);
  assert.equal(core.matches({...upper,model:'LOCAL'},{model:'CONGEST',transfer:true}),false);
  assert.equal(core.matches({...upper,model:'LOCAL',bound:'lower'},{model:'CONGEST',transfer:true}),true);
  assert.equal(core.matches({...upper,bound:'lower'},{model:'LOCAL',transfer:true}),false);
  assert.equal(core.matches({...upper,model:'SUPPORTED'},{model:'LOCAL',transfer:true}),false);
});
test('regimes put universal constants before parameter-dependent and slower bounds, independent of year',()=>{
  const rows=['other','degree','parameter','logstar','polylog','constant','logarithmic'].map((roundClass,i)=>({...upper,id:String(i),roundClass}));
  assert.deepEqual(core.filtered(rows,{},{}).map(r=>r.roundClass),['constant','parameter','logstar','degree','logarithmic','polylog','other']);
});
test('search matches author accents and requires all query terms',()=>{
  assert.equal(core.matches(upper,{q:'hanckowiak cover'},{authors:'Hańćkowiak'}),true);
  assert.equal(core.matches(upper,{q:'hanckowiak matching'},{authors:'Hańćkowiak'}),false);
});
test('depth-one density symbols remain searchable with ASCII nabla spellings',()=>{
  const row={...upper,approximationDisplay:'f(∇₁)',parameterDefinitions:[{symbol:'∇₁',description:'Depth-one minor density'}]};
  for(const q of ['nabla_1','nabla1','\\nabla_1','∇₁','depth-one density'])assert.equal(core.matches(row,{q}),true,q);
});
test('filters do not infer a general bound for a special graph class',()=>{
  assert.equal(core.matches({...upper,graphClass:'Outerplanar graphs'},{graph:'Planar'}),false);
  assert.equal(core.matches({...upper,graphClass:'Outerplanar graphs'},{graph:'General graphs'}),false);
  assert.equal(core.matches(upper,{randomization:'Randomized'}),false);
  assert.equal(core.matches(upper,{paper:'p'}),true);
  assert.equal(core.matches(upper,{paper:'another-paper'}),false);
});
test('CSV preserves formulas, quotes, and multiline assumptions safely',()=>{
  const value=core.csv([{...upper,approximation:'1+ε',assumptions:'a "quote"\nand a newline',variant:'=HYPERLINK("x")'}]);
  assert.ok(value.includes('"1+ε"'));
  assert.ok(value.includes('a ""quote""\nand a newline'));
  assert.ok(value.includes("\"'=HYPERLINK"));
});
test('graph-family filters exclude local genus, average degree and attached-clique qualifications',()=>{
  assert.ok(!core.graphTags('Planar graph with a clique attached at one vertex').includes('Planar'));
  assert.ok(!core.graphTags('H-minor-free for fixed nonplanar H').includes('Planar'));
  assert.ok(!core.graphTags('Asymptotic dimension d; r-locally Euler genus ≤ g').includes('Bounded genus'));
  assert.ok(!core.graphTags('Euler genus ≤ g plus at most a apices').includes('Bounded genus'));
  assert.ok(!core.graphTags('Bounded maximum average degree and depth-one density').includes('Bounded degree'));
  assert.ok(!core.graphTags('Bounded treewidth').includes('Trees / forests'));
  assert.ok(core.graphTags('Trees of maximum degree Δ').includes('Bounded degree'));
  assert.ok(core.graphTags('Bipartite graphs, Δ ≤ 3').includes('Bounded degree'));
});
test('ASCII and TeX math searches match the catalog notation',()=>{
  for(const q of ['1+epsilon','1+ε','1 + \\varepsilon']) assert.ok(core.searchMatches('1 + ε',q),q);
  for(const q of ['log-star','log*','log^*','\\log^{*}']) assert.ok(core.searchMatches('O(log* n)',q),q);
  assert.ok(core.searchMatches('O(log Δ / ε)','delta epsilon'));
  assert.equal(core.searchMatches('O(log n)','epsilon'),false);
});
test('SOTA filtering requires a literature annotation and never ranks remaining rows',()=>{
  assert.equal(core.matches(upper,{sota:true}),false);
  assert.equal(core.matches({...upper,sota:{setting:'Exact setting'}},{sota:true}),true);
});
test('BibTeX protects academic acronyms, underscores and TeX-sensitive characters',()=>{
  const citation=core.bibtex({id:'example',title:'CONGEST_BC & K_h: 50% #1',authors:'A One; B Two',year:2026,venue:'A & B',url:'https://example.org/paper'});
  assert.ok(citation.includes('title = {{CONGEST\\_BC \\& K\\_h: 50\\% \\#1}}'));
  assert.ok(citation.includes('author = {A One and B Two}'));
  assert.ok(citation.includes('https://example.org/paper'));
});
test('readable bounds preserve parameter meanings, lower bounds and explicit round counts',()=>{
  const catalog=require('../dist/data/catalog.json');
  const byId=Object.fromEntries(catalog.results.map(r=>[r.id,r]));
  assert.equal(byId['gen-aprsu10-matching'].roundsDisplay,'f(Δ, ε)');
  assert.equal(byId['gen-asw26-setcover'].roundsDisplay,'f(b, ε)');
  assert.equal(byId['gen-p26-density'].roundsDisplay,'f(d, ∇₁, ε)');
  assert.equal(byId['pic-nice-localgenus'].roundParameters[0].name,'asymptotic dimension');
  assert.equal(byId['outerplanar-five-lower'].roundsDisplay,'Constant rounds ruled out');
  assert.equal(byId['pic-large-linear-dom'].roundsDisplay,'3');
  assert.equal(byId['pic-girth-sublinear'].roundsDisplay,'3k');
  assert.equal(byId['gen-asw26-planar'].roundsDisplay,'Constant');
  for(const id of ['gen-emr14-cardinality','gen-fk25-tree']){
    assert.equal(byId[id].approximationDisplay,'1 − ε',id+' displays the approximation fraction without OPT');
    assert.equal(byId[id].approximation,'1 − ε of OPT',id+' retains the original source guarantee');
  }
  const fractionalBenchmarks=['gen-ako18-fractional','gen-asw26-planar','gen-asw26-trianglefree','gen-asw26-minordensity','gen-asw26-total','gen-asw26-setcover','gen-asw26-fractional','gen-low24-pack','gen-low24-cover','unitdisk-fractional-domination'];
  for(const id of fractionalBenchmarks){
    assert.equal(byId[id].approximationBenchmark,'fractional',id+' explicitly records the fractional optimum benchmark');
    assert.ok(!byId[id].approximationDisplay.includes('OPT'),id+' keeps the benchmark separate from the ratio');
  }
  for(const [id,formula] of [['gen-fk25-arboricity-fast','≥ (1−ε) w(V)/(4β)'],['gen-fk25-arboricity-better','≥ (1−ε) w(V)/(2β+1)']]){
    assert.equal(byId[id].approximationDisplay,formula,id+' retains the stronger total-input-weight guarantee');
  }
  for(const source of require('../dist/data/folklore.json').results){
    assert.equal(byId[source.id].proofFormula,source.proofFormula,source.id+' keeps OPT in the proof inequality');
    assert.ok(byId[source.id].proofFormula.includes('OPT'));
  }
  assert.ok(core.matches(byId['gen-aprsu10-matching'],{q:'max degree accuracy'}));
  assert.ok(catalog.results.filter(r=>r.roundClass==='constant').every(r=>!r.roundsDisplay.includes('(1)')));
  const csv=core.csv([byId['gen-aprsu10-matching']]);
  assert.ok(csv.includes('"O_Δ,ε(1)"')&&csv.includes('"f(Δ, ε)"'),'CSV preserves both source and readable notation');
});

test('PODC 2016 genus dependence stays explicit in the guarantee and round bound',()=>{
  const {sourceResults}=require('../dist/data/catalog.json');
  const row=sourceResults.find(r=>r.id==='amiri-genus-constant');
  assert.equal(row.approximationDisplay,'24g + O(1)');
  assert.equal(row.roundsDisplay,'12g + O(1)');
  assert.equal(row.roundClass,'parameter');
  assert.ok(row.parameters.includes('genus'));
  assert.equal(core.matches(row,{round:'constant'}),false,'fixing genus does not give the universal-constant regime');
  assert.equal(core.matches(row,{round:'parameter'}),true);
});

test('sparsity-dependent factors and runtimes retain independent parameter metadata',()=>{
  const {sourceResults}=require('../dist/data/catalog.json');
  const row=id=>sourceResults.find(r=>r.id===id);
  const heydt=row('sparse-expansion-constant'),kublenz=row('kublenz-expansion');
  assert.equal(heydt.approximationDisplay,'f(∇₁)');
  assert.equal(heydt.roundsDisplay,'f(∇₁)');
  assert.equal(heydt.roundClass,'parameter');
  assert.equal(heydt.approximationParameters[0].symbol,'∇₁');
  assert.equal(heydt.roundParameters[0].symbol,'∇₁');
  assert.equal(kublenz.approximationDisplay,'f(∇₁)');
  assert.equal(kublenz.approximationParameters[0].symbol,'∇₁');
  assert.equal(kublenz.roundsDisplay,'≤ 11','the audited fixed exchanges are independent of the density-dependent factor');
  assert.equal(kublenz.roundClass,'constant');
  assert.equal(kublenz.roundParameters,undefined);
  const policy=require('../dist/data/round-labels.json').universalConstants;
  assert.ok(policy.rounds.includes(kublenz.id));
  assert.ok(!policy.approximation.includes(kublenz.id),'a universal runtime certificate does not certify the factor');
  assert.equal(row('amiri-planar-connected').approximationDisplay,'Constant','universal approximation factors remain available');
});

test('audited constant-round schedules distinguish stated counts from conservative implementation bounds',()=>{
  const catalog=require('../dist/data/catalog.json');
  const row=id=>catalog.sourceResults.find(r=>r.id===id);
  for(const [id,rounds] of [['outerplanar-five','1'],['planar-two-dom-six','2'],['lenzen-planar-130','6']]){
    const r=row(id);
    assert.equal(r.rounds,'O(1)',id+' preserves the original asymptotic source statement');
    assert.equal(r.roundsDisplay,rounds);
    assert.equal(r.roundCountEvidence.basis,'stated');
  }
  for(const [id,rounds] of [['amiri-locally-embeddable','≤ 6'],['gen-w25-dom','≤ 7'],['amiri-planar-connected','≤ 10'],['kublenz-expansion','≤ 11'],['gen-aprsu10-dom','≤ 4']]){
    const r=row(id);
    assert.equal(r.roundsDisplay,rounds,id+' does not turn an implementation upper bound into an exact count');
    assert.equal(r.roundCountEvidence.basis,'phase-count');
    assert.equal(r.roundCountEvidence.rounds,rounds);
    assert.equal(core.matches(r,{round:'constant'}),true,'a fixed numeric bound remains universal');
  }
  const audited=catalog.sourceResults.filter(r=>r.roundCountEvidence?.rounds);
  assert.equal(audited.length,14);
  for(const r of audited){
    assert.ok(r.roundCountEvidence.checked&&r.roundCountEvidence.explanation);
    assert.ok(r.roundCountEvidence.evidence.every(e=>new URL(e.url).protocol==='https:'&&e.location));
  }
});

test('local threshold parameters affect k-domination guarantees without adding communication rounds',()=>{
  const catalog=require('../dist/data/catalog.json');
  for(const [id,factor] of [['pic-kdom-genus-constant','f(g, k)'],['pic-kdom-linkless-constant','f(k)']]){
    const r=catalog.sourceResults.find(r=>r.id===id);
    const source=require('../dist/data/picavet.json').results.find(s=>s.id===id);
    assert.equal(r.approximation,source.approximation,'the parameterized source factor remains available');
    assert.equal(r.approximationDisplay,factor);
    assert.ok(r.approximationParameters.length>0);
    assert.equal(r.rounds,'O(1)');
    assert.equal(r.roundsDisplay,'≤ 2');
    assert.equal(r.roundParameters,undefined,'local thresholds are not runtime dependencies');
    assert.equal(core.matches(r,{round:'constant'}),true);
    assert.equal(core.matches(r,{round:'parameter'}),false);
  }
});

test('uninstantiated constant totals and universal lower-bound budgets are not assigned fixed counts',()=>{
  const catalog=require('../dist/data/catalog.json');
  for(const id of ['gen-asw26-planar','gen-asw26-trianglefree']){
    const r=catalog.sourceResults.find(r=>r.id===id);
    assert.equal(r.roundsDisplay,'Constant');
    assert.equal(r.roundCountEvidence.basis,'not-specified');
    assert.equal(r.roundCountEvidence.rounds,undefined,'final broadcasts are not the complete algorithm');
  }
  const lower=catalog.sourceResults.find(r=>r.id==='outerplanar-five-lower');
  assert.equal(lower.roundsDisplay,'Constant rounds ruled out');
  assert.equal(lower.roundCountEvidence,undefined,'a universal impossibility is not a fixed-round algorithm');
  assert.ok(catalog.results.filter(r=>r.bound==='lower').every(r=>!r.roundCountEvidence));
});

test('round-count evidence survives CSV export but is not copied as a certificate onto derived results',()=>{
  const catalog=require('../dist/data/catalog.json');
  const r=catalog.sourceResults.find(r=>r.id==='lenzen-planar-130');
  const csv=core.csv([r]);
  assert.ok(csv.split('\r\n')[0].split(',').includes('roundCountEvidence'));
  assert.ok(csv.includes('"O(1)"'),'CSV retains the source round expression');
  assert.ok(csv.includes('"'+JSON.stringify(r.roundCountEvidence).replace(/"/g,'""')+'"'),'CSV includes the full evidence and count qualification');
  const derived=catalog.results.filter(r=>r.verification==='derived');
  assert.ok(derived.length>0);
  assert.ok(derived.every(r=>r.roundCountEvidence===undefined),'derived round complexity has its own transformation provenance');
});

test('universal round groups exclude parameter functions and bare constants have field-specific certificates',()=>{
  const {results,sourceResults}=require('../dist/data/catalog.json');
  const labels=require('../dist/data/round-labels.json');
  const universal=results.filter(r=>r.roundClass==='constant');
  assert.ok(universal.length>0);
  for(const row of universal){
    assert.equal(row.roundParameters,undefined,row.id+': the universal group has no named runtime parameters');
    assert.ok(!/\bf\(/.test(row.roundsDisplay),row.id+': no parameter function is hidden under Constant');
    assert.ok(!/[gkrΔε∇]/.test(row.roundsDisplay.replace(/Constant(?: rounds ruled out|-round impossibility)?|rounds?/g,'')),row.id+': the round bound has no structural or accuracy variable');
  }
  for(const row of sourceResults){
    if(row.roundParameters)assert.equal(row.roundClass,'parameter',row.id+': named runtime belongs to the parameter-dependent group');
    for(const field of ['approximation','rounds'])if(row[field]==='O(1)'){
      const metadata=row[field==='rounds'?'roundParameters':'approximationParameters'];
      if(metadata)assert.notEqual(row[field+'Display'],'Constant',row.id+': '+field+' keeps its own dependence');
      else assert.ok(labels.universalConstants[field].includes(row.id),row.id+': bare '+field+' needs its own universal certificate');
    }
  }
});

test('all named parameters use symbols while introduction metadata remains independent',()=>{
  const {results}=require('../dist/data/catalog.json');
  const row=id=>results.find(r=>r.id===id);
  assert.equal(row('gen-asw26-cover-random').roundsDisplay,'f(ρ, b, ε)');
  assert.equal(row('gen-asw26-fractional').roundsDisplay,'f(ρ, b, ε)');
  assert.equal(row('gen-asw26-cover-random').roundParameters.find(p=>p.symbol==='b').introduced,false);
  assert.equal(row('gen-bdgpsw26-dom').roundsDisplay,'f(g, ε)');
  assert.equal(row('gen-bdgpsw26-apex').roundsDisplay,'f(g, a, ε)');
});
test('Euler genus consistently uses g while preserving the paper notation',()=>{
  const catalog=require('../dist/data/catalog.json');
  const byId=Object.fromEntries(catalog.sourceResults.map(r=>[r.id,r]));
  const source=byId['gen-asw26-genus'];
  assert.equal(source.graphClass,'Euler genus ≤ g');
  assert.equal(source.graphClassSource,'Euler genus ≤ e');
  assert.equal(source.roundsDisplay,'f(g)');
  assert.equal(source.roundParameters[0].symbol,'g');
  assert.equal(source.roundParameters[0].introduced,true,'the class introduces the canonical parameter before the round bound');
  assert.equal(source.parameters,'Fixed g.');
  assert.equal(source.parametersSource,'Fixed e.');
  assert.deepEqual(source.notationChanges,[{name:'Euler genus',sourceSymbol:'e',symbol:'g'}]);
  assert.equal(source.rounds,'Oₑ(1)');
  assert.equal(catalog.notation[source.rounds],'O_e(1)','source TeX is kept separately from the displayed canonical bound');
  for(const id of ['gen-bdgpsw26-dom','gen-p26-genus','gen-p26-trianglefree']){
    assert.equal(byId[id].roundsDisplay,'f(g, ε)',id);
    assert.match(byId[id].graphClass,/Euler genus ≤ g/,id);
    assert.equal(byId[id].roundParameters.find(p=>p.name==='Euler genus').introduced,true,id);
  }
  assert.equal(byId['gen-w26-2dom'].roundsDisplay,'f(g, ε)');
  assert.equal(core.resolveClass('Euler genus ≤ g').id,core.resolveClass('Bounded Euler genus').id,'old class links keep their scope');
  assert.notEqual(core.resolveClass('Euler genus ≤ g').id,core.resolveClass('Bounded orientable genus').id,'Euler and orientable genus stay distinct');
});
test('Euler genus normalization leaves orientable genus and girth parameters unchanged',()=>{
  const catalog=require('../dist/data/catalog.json');
  const byId=Object.fromEntries(catalog.sourceResults.map(r=>[r.id,r]));
  const originals=[...require('../dist/data/sparse.json').results,...require('../dist/data/picavet.json').results];
  const guarded=originals.filter(r=>(r.id.startsWith('pic-girth-')&&r.id!=='pic-girth-cycle-lower')||['amiri-genus-ptas','amiri-genus-constant','pic-kdom-genus-constant','pic-kdom-genus-ptas','pic-genus-broadcast-historical'].includes(r.id));
  assert.ok(guarded.length>5);
  for(const original of guarded){
    const result=byId[original.id];
    for(const field of ['approximation','rounds','parameters','assumptions','summary'])assert.equal(result[field],original[field],original.id+' retains '+field);
    assert.equal(result.notationChanges,undefined,original.id+' does not receive an Euler parameter rewrite');
  }
});
test('accuracy and approximation slack use epsilon without rewriting unrelated parameters',()=>{
  const catalog=require('../dist/data/catalog.json');
  const byId=Object.fromEntries(catalog.results.map(r=>[r.id,r]));
  const originals=[...require('../dist/data/general.json').results,...require('../dist/data/picavet.json').results];
  const cases=[
    ['gen-w26-2dom','η','6 + ε','f(g, ε)'],
    ['gen-asw26-fractional','δ','1 + ε','f(ρ, b, ε)'],
    ['pic-girth-cycle-lower','δ','> 2r + 1 − ε','O(r)'],
  ];
  for(const [id,symbol,approximation,rounds] of cases){
    const result=byId[id],source=originals.find(r=>r.id===id);
    assert.equal(result.approximationDisplay,approximation,id+' uses epsilon for the guarantee');
    assert.equal(result.roundsDisplay,rounds,id+' preserves the complete runtime with canonical accuracy');
    assert.ok(result.parameters.includes('ε'),id+' introduces epsilon in the parameter description');
    assert.ok(!result.parameters.includes(symbol),id+' does not retain an alternate accuracy symbol in displayed prose');
    assert.equal(result.parametersSource,source.parameters,id+' keeps original parameter notation');
    for(const field of ['approximation','rounds','sourceUrl','paperId','verification'])assert.equal(result[field],source[field],id+' preserves source '+field);
    assert.ok(result.notationChanges.some(p=>p.sourceSymbol===symbol&&p.symbol==='ε'),id+' records the semantic rename');
    assert.ok(catalog.notation[result.approximationDisplay].includes('\\varepsilon'),id+' renders canonical epsilon with MathJax');
    if(result.roundParameters){
      assert.ok(result.roundParameters.some(p=>p.symbol==='ε'&&p.introduced),id+' reuses accuracy already introduced in its guarantee');
      assert.ok(!result.roundParameters.some(p=>p.symbol===symbol),id+' removes the alternate runtime parameter key');
    }
  }
  const fractional=byId['gen-asw26-fractional'];
  assert.equal(fractional.approximationBenchmark,'fractional');
  assert.ok(fractional.sota.setting.includes('ε > 0'));
  assert.ok(!JSON.stringify(fractional.sota).includes('δ'));
  assert.ok(!JSON.stringify(byId['gen-w26-2dom'].sota).includes('η'));
  assert.ok(!byId['planar-two-dom-six'].sota.reason.includes('η'),'cross-result SOTA discussion uses the canonical slack');
  const comparison=catalog.sotaFrontier.dominance.find(c=>c.better==='gen-asw26-minordensity'&&c.worse==='gen-asw26-planar');
  assert.ok(comparison.conditions.rounds.includes('accuracy ε=1/294'),'fixed internal solver accuracy is named consistently');
  const derived=catalog.results.find(r=>r.sourceResultId==='gen-asw26-fractional'&&r.problemScope.node==='fractional-dominating-set');
  assert.ok(derived,'the reusable reduction emits a fractional domination consequence');
  assert.equal(derived.approximationDisplay,'1 + ε');
  assert.equal(derived.approximationBenchmark,'fractional','the derived guarantee retains the fractional benchmark');
  assert.equal(derived.roundsDisplay,'f(ρ, b, ε)');
  assert.equal(derived.sourceVerification,'primary');
  assert.equal(derived.sourceMath.approximation,'1 + δ against fractional OPT','derived provenance keeps the original theorem expression');
  for(const id of ['gen-ffk21-mwm-rand','gen-dp26-matching','gen-fk25-arboricity-fast','gen-fk25-arboricity-better','gen-beks19-full-eps']){
    const result=byId[id],source=originals.find(r=>r.id===id);
    for(const field of ['approximation','rounds','parameters','assumptions'])assert.equal(result[field],source[field],id+' keeps unrelated '+field);
    assert.equal(result.notationChanges,undefined,id+' has no accuracy-symbol rewrite');
  }
  assert.ok(byId['gen-ffk21-mwm-rand'].roundsDisplay.includes('δ'),'failure probability remains delta');
  assert.ok(byId['gen-dp26-matching'].sota.setting.includes('δ'),'tail-exponent parameter remains delta');
});

test('every catalog factor has an explicit classification and the global constant filter selects exactly those guarantees',()=>{
  const catalog=require('../dist/data/catalog.json');
  assert.ok(catalog.results.every(r=>typeof r.constantApproximation==='boolean'),'source and derived guarantees are both classified');
  assert.equal(catalog.sourceResults.filter(r=>r.constantApproximation).length,32);
  const expected=catalog.results.filter(r=>r.constantApproximation).map(r=>r.id).sort();
  assert.ok(expected.length>catalog.sourceResults.filter(r=>r.constantApproximation).length,'classified reduction consequences are included');
  assert.deepEqual(core.filtered(catalog.results,{}, {constantRatio:true}).map(r=>r.id).sort(),expected);
  for(const state of [{},{problem:'MDS',graph:'Planar',sota:true},{round:'parameter'}]){
    assert.deepEqual(core.filtered(catalog.results,{}, {...state,constantRatio:false}),core.filtered(catalog.results,{},state),'turning off the ratio filter preserves the existing query');
  }
});

test('constant factors include maximization fractions and stay independent of parameter-dependent runtimes',()=>{
  const catalog=require('../dist/data/catalog.json');
  const byId=Object.fromEntries(catalog.results.map(r=>[r.id,r]));
  const matching=byId['gen-bcgs17-mwm'];
  assert.equal(matching.objective,'max');
  assert.equal(matching.approximationDisplay,'1/2');
  assert.equal(matching.constantApproximation,true);
  assert.equal(core.matches(matching,{constantRatio:true}),true);
  for(const [id,factor,rounds] of [
    ['pic-thesis-genus-616','616','f(g)'],
    ['pic-thesis-pw2-dom','50','f(H)'],
    ['pic-large-50-dom','50','O(t)'],
    ['pic-thesis-path-excluded-exact','1','t − 1']
  ]){
    const r=byId[id];
    assert.equal(r.approximationDisplay,factor);
    assert.equal(r.roundsDisplay,rounds);
    assert.equal(r.roundClass,'parameter');
    assert.equal(r.constantApproximation,true,id+' has a factor independent of its runtime parameters');
    assert.equal(core.matches(r,{constantRatio:true,round:'parameter'}),true);
    assert.equal(core.matches(r,{constantRatio:true,round:'constant'}),false,'a constant ratio does not certify constant rounds');
  }
  for(const id of require('../dist/data/round-labels.json').universalConstants.approximation){
    assert.equal(byId[id].constantApproximation,true,id+' retains its reviewed universal factor');
  }
});

test('the ratio filter excludes every stated accuracy or structural dependence, including lower bounds and pieces',()=>{
  const {results}=require('../dist/data/catalog.json');
  const byId=Object.fromEntries(results.map(r=>[r.id,r]));
  for(const id of [
    'sparse-planar-eleven','chang-independent-logstar','gen-bcgs17-fast-mwm',
    'outerplanar-five-lower','planar-k-dom-trivial','gen-bdgpsw26-ktuple',
    'amiri-genus-constant','pic-nice-localgenus','pic-large-linear-dom',
    'pic-thesis-pathpower-lower','gen-ghs12-eds','folklore-degree-mds',
    'dory-arboricity-lower','sparse-expansion-constant','pic-kdom-genus-constant',
    'pic-distance-k2t-constant'
  ]){
    const r=byId[id];
    assert.ok(r,'dependent fixture exists: '+id);
    assert.equal(r.constantApproximation,false,id+' keeps the dependence in its stated factor');
    assert.equal(core.matches(r,{constantRatio:true}),false,id+' is not promoted by fixing or bounding a parameter');
  }
  assert.equal(byId['pic-kdom-genus-constant'].roundClass,'constant','local parameter thresholds need no extra rounds');
  assert.equal(byId['pic-kdom-genus-constant'].constantApproximation,false,'a universal round count does not make the factor universal');
});

test('exact reduction substitutions recompute the factor instead of inheriting source classification',()=>{
  const {results}=require('../dist/data/catalog.json');
  const byId=Object.fromEntries(results.map(r=>[r.id,r]));
  const source=byId['gen-as10-setcover'];
  const numeric=byId['derived-gen-as10-setcover--vertex-cover-to-set-cover'];
  const degree=byId['derived-gen-as10-setcover--mds-to-set-cover'];
  assert.equal(source.approximationDisplay,'f');
  assert.equal(source.constantApproximation,false);
  assert.equal(numeric.sourceResultId,source.id);
  assert.equal(numeric.approximationDisplay,'2');
  assert.equal(numeric.constantApproximation,true,'the certified f=2 instance has a numerical factor');
  assert.equal(core.matches(numeric,{constantRatio:true}),true);
  assert.equal(degree.constantApproximation,false,'the alternative f=Δ+1 substitution still depends on the physical input');
  assert.equal(core.matches(degree,{constantRatio:true}),false);
  assert.equal(results.filter(r=>r.sourceResultId===source.id&&r.reductionPath?.[0]==='vertex-cover-to-set-cover'&&r.constantApproximation).length,1);
});

test('Planar MDS SOTA and constant ratios compose through the exact factor-seven certificate',()=>{
  const catalog=require('../dist/data/catalog.json');
  const r=catalog.results.find(r=>r.id==='gen-asw26-minordensity');
  const state={problem:'MDS',graph:'Planar',sota:true,constantRatio:true};
  const certificate=core.matchedScopeTransfer(r,state);
  assert.ok(certificate);
  assert.equal(certificate.graph,'planar');
  assert.deepEqual(certificate.approximation,{substitutions:{a:'3'},factor:'7',constantApproximation:true});
  assert.deepEqual(core.effectiveApproximation(r,state),{
    approximationDisplay:'7',approximationBenchmark:'fractional',constantApproximation:true,specialization:certificate.approximation
  });
  assert.equal(core.sotaContext(r,state).transfer,certificate,'factor display and SOTA use the same certificate');
  const visible=new Set(core.filtered(catalog.results,{},state).map(row=>row.id));
  assert.ok(visible.has(r.id),'the broader frontier theorem supplies the certified Planar factor');
  assert.equal(visible.has('gen-asw26-planar'),false,'the dominated corollary is not restored by the new filter');
  assert.equal(core.matches(r,{...state,sota:false}),true,'the reviewed factor applies with the SOTA toggle off');
  assert.equal(core.effectiveApproximation(r).approximationDisplay,'2a + 1');
  assert.equal(core.effectiveApproximation(r).constantApproximation,false,'the global theorem remains parameter-dependent');
  for(const other of [{graph:'Minor-free'},{graph:'Trees'},{graph:'Triangle-free planar'},{...state,classTransfer:false}]){
    assert.equal(core.matchedScopeTransfer(r,other),null,'only the exact certified scope instantiates a=3');
    assert.equal(core.effectiveApproximation(r,other).constantApproximation,false);
    assert.equal(core.matches(r,{...other,constantRatio:true}),false);
  }
  const dominated={...r,dominatedBy:['another-result']};
  assert.equal(core.sotaContext(dominated,state).status,'dominated');
  assert.equal(core.effectiveApproximation(dominated,state).constantApproximation,true,'a correct factor specialization does not depend on frontier status');
  assert.equal(core.matches(r,{...state,q:'7'}),true,'search includes the factor shown for the query');
  assert.equal(core.matches(r,{...state,q:'2a+1'}),true,'search retains the original source formula');
});

test('CSV preserves the global factor classification beside the effective query factor and classification',()=>{
  const catalog=require('../dist/data/catalog.json');
  const r=catalog.results.find(r=>r.id==='gen-asw26-minordensity');
  const effective=core.effectiveApproximation(r,{problem:'MDS',graph:'Planar'});
  const csv=core.csv([{
    id:r.id,approximationDisplay:r.approximationDisplay,constantApproximation:r.constantApproximation,
    queryApproximationDisplay:effective.approximationDisplay,queryConstantApproximation:effective.constantApproximation
  }]);
  const [header,body]=csv.split('\r\n');
  const values=body.match(/"(?:[^"]|"")*"/g).map(value=>value.slice(1,-1).replace(/""/g,'"'));
  const exported=Object.fromEntries(header.split(',').map((field,index)=>[field,values[index]]));
  assert.equal(exported.approximationDisplay,'2a + 1');
  assert.equal(exported.constantApproximation,'false');
  assert.equal(exported.queryApproximationDisplay,'7');
  assert.equal(exported.queryConstantApproximation,'true');
});

test('ratio lower bounds use inequalities while preserving endpoint inclusion and source statements',()=>{
  const catalog=require('../dist/data/catalog.json');
  const byId=Object.fromEntries(catalog.results.map(r=>[r.id,r]));
  const strict=byId['pic-thesis-pathwidth-lower'];
  assert.equal(strict.approximationDisplay,'> 2 pw(H) − 1 − ε');
  assert.equal(strict.approximation,'No (2 pw(H) − 1 − ε)-approximation');
  assert.equal(byId['pic-thesis-pathpower-lower'].approximationDisplay,'≥ 2t + 1','the matching threshold itself is not excluded');
  assert.equal(byId['pic-girth-time-lower'].approximationDisplay,'≥ Δ');
  assert.equal(byId['pic-girth-sublinear-lower'].approximationDisplay,'Ω(k + f(k)^(k/(k+1)))');
  assert.equal(byId['gen-fk25-path-lower'].approximationDisplay,'1 − ε','necessary-round lower bounds keep their target guarantee');
  const derived=byId['derived-pic-thesis-pathwidth-lower--mds-to-local-covering'];
  assert.equal(derived.approximationDisplay,strict.approximationDisplay,'identity reductions preserve the inequality');
  assert.equal(derived.sourceMath.approximation,strict.approximation,'provenance retains the original impossibility statement');
  assert.equal(derived.derivedMath.approximation,catalog.notation[strict.approximationDisplay]);
  for(const r of catalog.results)if(r.bound==='lower')assert.ok(!r.approximationDisplay.startsWith('No '),r.id+' has concise mathematical notation');
});
test('thesis attribution preserves distinct path-power witnesses and exports a PhD citation',()=>{
  const {papers,results}=require('../dist/data/catalog.json');
  const thesis=papers.find(p=>p.id==='pic-thesis-2026');
  const amiri=results.find(r=>r.id==='gen-as26-power-lower');
  const witness=results.find(r=>r.id==='pic-thesis-pathpower-lower');
  assert.ok(amiri.relatedResults.includes(witness.id));
  assert.ok(witness.graphClass.includes('endpoint leaves'));
  assert.ok(!amiri.graphClass.includes('endpoint leaves'));
  assert.ok(witness.sourceUrl.endsWith('#page=148'));
  const citation=core.bibtex(thesis);
  assert.ok(citation.startsWith('@phdthesis{'));
  assert.ok(citation.includes('school = {Université de Bordeaux}'));
});
test('default ordering uses publication-ranked problems, newest years within each block and stable ties',()=>{
  const make=(id,fields={})=>({...upper,id,problem:'Dominating set',roundClass:'constant',variant:'Unweighted',objective:'min',paperId:'paper',...fields});
  const rows=[make('old-planar',{graphClass:'Planar',year:2010}),make('new-tree',{graphClass:'Trees',year:2026}),make('b-planar',{graphClass:'Planar',year:2026}),make('a-planar',{graphClass:'Planar',year:2026}),make('local',{graphClass:'Planar',model:'LOCAL',year:2000}),make('other-problem',{problem:'Vertex cover',graphClass:'Planar',year:2026}),make('connected',{problem:'Connected dominating set',graphClass:'Planar',year:2026})];
  assert.deepEqual(core.filtered(rows,{},{}).map(r=>r.id),['a-planar','b-planar','new-tree','old-planar','local','other-problem','connected']);
  assert.equal(core.compareText('Degree 2','Degree 10')<0,true,'numeric parameters use natural ordering');
});
test('problem blocks are newest-first across graph classes, models and round complexities',()=>{
  const catalog=require('../dist/data/catalog.json'),papers=Object.fromEntries(catalog.papers.map(p=>[p.id,p]));
  for(const sort of ['rounds','problem'])for(const filters of [{},{problem:'Dominating set'},{graph:'Planar'},{model:'CONGEST'},{sota:true}]){
    const rows=core.filtered(catalog.results,papers,{sort,...filters});
    const previous=new Map();
    for(const row of rows){
      const key=(sort==='rounds'?row.roundClass+'|':'')+row.problem;
      if(previous.has(key))assert.ok(previous.get(key)>=row.year,sort+' / '+key+' / '+row.id);
      previous.set(key,row.year);
    }
  }
  const rows=[
    {...upper,id:'older-constant',problem:'Dominating set',roundClass:'constant',year:2010},
    {...upper,id:'newer-logstar',problem:'Dominating set',roundClass:'logstar',year:2026},
  ];
  assert.deepEqual(core.filtered(rows,{},{}).map(r=>r.id),['older-constant','newer-logstar'],'default preserves round-group priority');
  assert.deepEqual(core.filtered(rows,{}, {sort:'problem'}).map(r=>r.id),['newer-logstar','older-constant'],'explicit Problem sort orders its whole block by year');
});
test('problem prominence counts source publications once and ignores generated bounds and folklore',()=>{
  const catalog=require('../dist/data/catalog.json'),papers=Object.fromEntries(catalog.papers.map(p=>[p.id,p]));
  const publications=new Map(core.problemNodes.map(node=>[node.id,new Set()])),all=new Set();
  for(const row of catalog.sourceResults){
    if(row.attribution==='folklore'||row.verification==='derived')continue;
    publications.get(row.problemScope.node).add(row.paperId);all.add(row.paperId);
  }
  for(const node of core.problemNodes)assert.equal(core.problemPublicationCount(node.id),publications.get(node.id).size,node.label);
  assert.equal(core.problemPublicationCount(''),all.size,'All problems counts distinct publications across problems');
  assert.equal(core.problemPublicationCount('unknown problem'),0);
  assert.equal(core.problemPublicationCount('MDS'),core.problemPublicationCount('dominating-set'),'aliases share the canonical count');
  const expected=core.problemNodes.slice().sort((a,b)=>publications.get(b.id).size-publications.get(a.id).size||core.compareText(a.label,b.label));
  assert.deepEqual(core.problemNodes.slice().sort((a,b)=>core.compareProblems(a.label,b.label)).map(n=>n.id),expected.map(n=>n.id),'descending counts with alphabetical ties');
  assert.ok(catalog.results.some(r=>r.verification==='derived'&&r.problemScope.node==='fractional-vertex-cover'));
  assert.equal(core.problemPublicationCount('fractional-vertex-cover'),0,'a derived-only problem gains no source publication');
  const before=expected.map(n=>core.problemPublicationCount(n.id));
  for(const state of [{model:'CONGEST'},{round:'logstar'},{sota:true}]){
    core.filtered(catalog.results,papers,state);
    assert.deepEqual(expected.map(n=>core.problemPublicationCount(n.id)),before,'publication prominence is independent of active filters');
  }
});
test('every catalog sort is independent of source-file insertion order, including filtered views',()=>{
  const {results,papers}=require('../dist/data/catalog.json');
  const paperMap=Object.fromEntries(papers.map(p=>[p.id,p]));
  let seed=1403;
  const shuffle=rows=>{
    const copy=[...rows];
    for(let i=copy.length-1;i>0;i--){seed=(seed*1664525+1013904223)>>>0;const j=seed%(i+1);[copy[i],copy[j]]=[copy[j],copy[i]];}
    return copy;
  };
  for(const sort of ['rounds','problem','newest','oldest'])for(const filter of [{},{problem:'Dominating set'},{round:'constant',bound:'lower'}]){
    const state={sort,...filter};
    const expected=core.filtered(results,paperMap,state).map(r=>r.id);
    for(let i=0;i<10;i++)assert.deepEqual(core.filtered(shuffle(results),paperMap,state).map(r=>r.id),expected,sort+' order after shuffle');
  }
});
test('planar algorithm queries include containing classes and preserve restricted intersections',()=>{
  const r=graphClass=>({...upper,graphClass});
  for(const graphClass of ['General graphs','Bounded expansion','Arboricity ≤ α','Sub-logarithmic expansion f(r) = o(log r)','Bounded Euler genus','Bounded orientable genus g','Excluded fixed minor','Locally embeddable'])assert.ok(core.matches(r(graphClass),{graph:'Planar'}),graphClass);
  for(const graphClass of ['Outerplanar','Triangle-free planar','Planar without 4-cycles','Graphs of maximum degree Δ','Bipartite graphs','K₂,ₜ-minor-free','Bounded expansion; girth ≥ 4r + 2','Planar incidence graph'])assert.equal(core.matches(r(graphClass),{graph:'Planar'}),false,graphClass);
  assert.ok(core.matches(r('Planar'),{graph:'Trees / forests'}));
});
test('lower bounds use the opposite certified direction without generalizing excluded-minor witnesses',()=>{
  const lower=graphClass=>({...upper,bound:'lower',graphClass});
  for(const graphClass of ['Outerplanar','Oriented paths','Cycles'])assert.ok(core.matches(lower(graphClass),{graph:'Planar'}),graphClass);
  for(const graphClass of ['General graphs','Arboricity 2','H-minor-free graphs','r-th powers of paths'])assert.equal(core.matches(lower(graphClass),{graph:'Planar'}),false,graphClass);
  assert.equal(core.inclusionPath('Planar','Minor-free',true),null,'a chosen nonplanar exclusion is not every prescribed H');
});
test('Euler genus, independence growth and local restrictions retain their distinct scopes',()=>{
  assert.equal(core.inclusionPath('Bounded Euler genus','Bounded orientable genus'),null);
  assert.ok(core.inclusionPath('Planar','Bounded orientable genus'));
  assert.equal(core.inclusionPath('Planar','Polynomial independence growth'),null);
  assert.ok(core.inclusionPath('Unit-disk','Polynomial independence growth'));
  assert.equal(core.inclusionPath('Locally embeddable','Bounded expansion'),null);
  assert.ok(core.inclusionPath('Locally embeddable','Bounded arboricity'));
});
test('class and problem names in free text use their networks while retaining author terms',()=>{
  assert.equal(core.searchContext({q:'triangle-free planar matching'}).target.id,'triangle-planar');
  assert.equal(core.searchContext({q:'triangle-free planar matching'}).problemTarget.id,core.resolveProblem('Maximum matching').id);
  assert.equal(core.searchContext({q:'triangle-free planar matching'}).query,'');
  assert.equal(core.searchContext({q:'triangle-free planar matching Picavet'}).query,'picavet');
  assert.ok(core.matches(upper,{q:'planar cover'}));
  assert.equal(core.matches({...upper,graphClass:'Outerplanar'},{q:'planar cover'}),false);
  assert.equal(core.matches(upper,{graph:'Planar',classTransfer:false}),false);
  assert.equal(core.matches({...upper,graphClass:'Planar'},{graph:'Planar',classTransfer:false}),true);
});
test('class transfer preserves prerequisites and does not promote source-setting SOTA',()=>{
  const {results}=require('../dist/data/catalog.json');
  const coloring=results.find(r=>r.id==='gen-aprsu10-matching');
  assert.ok(coloring.prerequisite.includes('proper 2-coloring'));
  const source=results.find(r=>r.id==='gen-asw26-genus');
  assert.ok(core.graphMatch(source,{graph:'Planar'}).inherited);
  assert.equal(core.sotaApplies(source,{graph:'Planar'}),false);
  assert.equal(core.matches(source,{graph:'Planar',sota:true}),false);
  assert.equal(core.sotaApplies(source,{graph:'Bounded Euler genus'}),true);
});
test('canonical graph names agree across problems without erasing restrictions or source wording',()=>{
  const {results,graphNetwork}=require('../dist/data/catalog.json');
  const byId=Object.fromEntries(results.map(r=>[r.id,r]));
  assert.equal(byId['amiri-planar-connected'].graphClass,'Planar');
  assert.equal(byId['gen-w26-planar-dom'].graphClass,'Planar');
  assert.equal(byId['gen-w26-planar-dom'].graphClassSource,'Planar graphs');
  assert.ok(!results.some(r=>['Planar graphs','General graphs','Triangle-free planar graphs','Trees, including unrooted trees'].includes(r.graphClass)));
  for(const r of results)if(r.graphClassSource)assert.equal(r.graphScope.node,graphNetwork.scopes[r.graphClassSource].node,'normalizing '+r.id+' preserves its inclusion scope');
  assert.equal(byId['gen-ffk21-vc-lower'].graphClass,'Bipartite; Δ ≤ 3');
  assert.equal(byId['pic-girth-time-lower'].graphClass,'Trees; maximum degree ≤ Δ');
  assert.ok(core.resolveClass('General graphs').id===core.resolveClass('General').id,'old URLs retain their meaning');
});

const thesisResult=id=>{
  const row=require('../dist/data/catalog.json').sourceResults.find(r=>r.id===id);
  assert.ok(row,'reviewed thesis source exists: '+id);
  return row;
};

test('the thesis pathwidth-two extension follows excluded-minor inclusions without widening to all planar graphs',()=>{
  const broader=thesisResult('pic-thesis-pw2-dom');
  assert.equal(core.matches(broader,{problem:'MDS',graph:'K2t'}),true,'K₂,t is an admissible excluded minor');
  assert.equal(core.graphMatch(broader,{graph:'K2t'}).inherited,true);
  assert.equal(core.matches(broader,{graph:'K2t',classTransfer:false}),false,'the broader theorem is transferred through the network');
  for(const graph of ['Planar','General','minor'])assert.equal(core.matches(broader,{graph}),false,graph+' is not a subclass certified by pw(H)≤2');
  const exact=thesisResult('pic-thesis-path-excluded-exact');
  assert.equal(core.matches(exact,{graph:'path-minor'}),true);
  for(const graph of ['Planar','General','minor'])assert.equal(core.matches(exact,{graph}),false,'bounded component diameter is not inferred for '+graph);
});

test('the local-apex thesis bound is inherited by contained families without asserting a global minor restriction',()=>{
  const row=thesisResult('pic-thesis-local-apex');
  for(const graph of ['apex','local-genus','Planar']){
    assert.equal(core.matches(row,{graph}),true,graph+' satisfies the certified local-apex prerequisites');
    assert.equal(core.graphMatch(row,{graph}).inherited,true);
    assert.equal(core.matches(row,{graph,classTransfer:false}),false);
  }
  for(const graph of ['General','minor','Bounded expansion'])assert.equal(core.matches(row,{graph}),false,'the local theorem does not cover arbitrary '+graph+' inputs');
  assert.equal(core.inclusionPath('local-apex','minor'),null,'local apex deletion sets do not imply a global excluded minor');
});

test('new thesis bounds keep their structural parameters outside universal Constant rounds',()=>{
  const parameterIds=['pic-thesis-genus-616','pic-thesis-local-apex','pic-thesis-pw2-dom','pic-thesis-degeneracy-vc','pic-thesis-planar-distance-dom','pic-thesis-genus-distance-dom','pic-thesis-path-excluded-exact'];
  for(const id of parameterIds){
    const row=thesisResult(id);
    assert.equal(core.matches(row,{round:'constant'}),false,id+' retains its parameter-dependent round budget');
    assert.equal(core.matches(row,{round:'parameter'}),true);
  }
  const sixRounds=thesisResult('pic-thesis-planar-205');
  assert.equal(sixRounds.roundsDisplay,'6');
  assert.equal(core.matches(sixRounds,{round:'constant'}),true,'the parameter-free six-round implementation remains universal');
  const genus=thesisResult('pic-thesis-genus-616');
  assert.equal(genus.roundsDisplay,'f(g)');
  assert.ok(!genus.approximationDisplay.includes('g'),'genus dependence is in the runtime, not the constant ratio');
});

test('the degeneracy vertex-cover theorem retains its full preprocessing budget and anonymous model',()=>{
  const row=thesisResult('pic-thesis-degeneracy-vc');
  assert.equal(row.roundsDisplay,'((1 + 1/ε)d + 1)² + 1','the proof bound includes its extra preprocessing round');
  assert.equal(row.approximationDisplay,'2 + ε');
  assert.match(row.assumptions,/two bits per message/i);
  assert.equal(core.matches(row,{problem:'Vertex cover',graph:'Planar',model:'Anonymous'}),true);
  assert.equal(core.matches(row,{model:'LOCAL',transfer:true}),true,'the anonymous protocol also implements a LOCAL algorithm');
  assert.equal(core.matches(row,{model:'LOCAL',transfer:false}),false,'exact-model filtering retains the source model');
  assert.equal(core.matches(row,{graph:'General'}),false,'a fixed degeneracy bound is required');
});

test('thesis distance-k algorithms stay separate from ordinary domination and preserve the genus tradeoff',()=>{
  const planar=thesisResult('pic-thesis-planar-distance-dom'),genus=thesisResult('pic-thesis-genus-distance-dom');
  for(const row of [planar,genus]){
    assert.equal(row.problem,'Distance-k dominating set');
    assert.equal(core.matches(row,{problem:'Distance-k dominating set'}),true);
    for(const problemTransfer of [true,false])assert.equal(core.matches(row,{problem:'MDS',problemTransfer}),false,'distance-k is not silently specialized to k=1');
    assert.equal(row.approximationDisplay,'k^{O(k)}');
  }
  assert.equal(planar.roundsDisplay,'O(k)');
  assert.equal(genus.roundsDisplay,'f(g, k)');
  assert.ok(genus.roundParameters.every(p=>p.introduced),'the preceding problem and class introduce k and g');
  assert.equal(core.graphMatch(genus,{graph:'Planar'}).inherited,true,'the genus theorem applies to planar inputs');
  assert.equal(core.matches(planar,{graph:'euler'}),false,'the linear-in-k planar schedule is not extended to genus g');
});
