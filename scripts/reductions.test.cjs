const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const vm=require('node:vm');
const core=require('../dist/core.js');
const catalog=require('../dist/data/catalog.json');
const byId=Object.fromEntries(catalog.results.map(result=>[result.id,result]));
const sourceRecords=catalog.sourceResults||catalog.results.filter(result=>result.verification!=='derived');
const problemId=value=>core.resolveProblem(value)?.id;
const solvesId=application=>typeof application.solves==='string'?application.solves:application.solves?.id;
const applications=(entry,state={})=>core.reductionApplications(entry,{bound:'upper',...state});
function recipe(from,to,status='automatic'){
  const entry=core.reductions.find(entry=>entry.from===problemId(from)&&entry.to===problemId(to)&&entry.status===status);
  assert.ok(entry,from+' → '+to+' has a '+status+' recipe');
  return entry;
}
function assertApplication(application,entry,bound='upper'){
  const {result,sourceResult,derivedResult}=application;
  assert.ok(result,'the immediate input theorem is available');
  assert.ok(sourceResult,'the original article theorem is available');
  assert.equal(derivedResult.verification,'derived');
  assert.equal(derivedResult.bound,bound);
  assert.equal(derivedResult.parentResultId,result.id);
  assert.equal(derivedResult.sourceResultId,sourceResult.id);
  assert.equal(derivedResult.reductionPath[0],entry.id);
  assert.equal(solvesId(application),derivedResult.problemScope.node);
  assert.equal(application.runtime,derivedResult.roundsDisplay);
  assert.equal(application.guarantee,derivedResult.approximationDisplay);
  assert.equal(application.conversion,entry.runtime);
  assert.equal(application.automatic,true);
  assert.ok(Array.isArray(application.notes));
}

test('reduction recipes resolve endpoints and require an explicit executable certificate',()=>{
  assert.ok(Array.isArray(core.reductions)&&core.reductions.length>=8);
  assert.equal(new Set(core.reductions.map(entry=>entry.id)).size,core.reductions.length);
  for(const entry of core.reductions){
    assert.ok(core.resolveProblem(entry.from),entry.id+' has a known input problem');
    assert.ok(core.resolveProblem(entry.to),entry.id+' has a known solver problem');
    assert.ok(Array.isArray(entry.models)&&entry.models.length,entry.id+' records supported models');
    if(entry.kind==='relaxation')assert.equal(entry.engine,undefined,entry.id+' cannot round an LP by changing a label');
    for(const bound of ['upper','lower']){
      if(!entry.engine?.[bound])assert.deepEqual(applications(entry,{bound}),[],entry.id+' has no certified '+bound+' operation');
      else for(const application of applications(entry,{bound}))assertApplication(application,entry,bound);
    }
  }
});

test('integral MDS applications expose both the original theorem and its compiled consequence',()=>{
  const entry=recipe('MDS','Local covering');
  const list=applications(entry);
  assert.deepEqual(applications(entry.id).map(application=>application.derivedResult.id),list.map(application=>application.derivedResult.id));
  const ids=new Set(list.map(application=>application.sourceResult.id));
  for(const id of ['gen-asw26-cover-det','gen-asw26-cover-random'])assert.ok(ids.has(id),id+' supplies an integral solver');
  for(const id of ['gen-asw26-fractional','gen-low24-cover','unitdisk-fractional-domination'])assert.equal(ids.has(id),false,id+' has fractional output only');
  for(const application of list){
    assertApplication(application,entry);
    assert.equal(solvesId(application),problemId('MDS'));
    const original=byId[application.result.id];
    for(const field of ['rounds','roundsDisplay','roundClass','approximation','approximationDisplay','graphClass','model','parameters','assumptions','sourceUrl'])assert.deepEqual(application.result[field],original[field],field+' preserves the source statement');
    assert.equal(application.derivedResult.sourceMath.rounds,original.rounds);
    assert.equal(application.derivedResult.roundsDisplay,original.roundsDisplay,'identity conversions keep the exact bound');
  }
});

test('total domination retains its typed integral solver and isolate-free obligation',()=>{
  const entry=recipe('Total dominating set','Local covering');
  const list=applications(entry);
  assert.ok(list.length);
  for(const application of list){
    assertApplication(application,entry);
    assert.equal(solvesId(application),problemId('Total dominating set'));
    assert.equal(application.result.problemScope.node,problemId('Local covering'));
    assert.match(application.derivedResult.assumptions,/isolat/i);
  }
});

test('fractional domination stays fractional and conditional simulations expose only certified generated rows',()=>{
  const entry=recipe('Fractional dominating set','Fractional local covering');
  const list=applications(entry);
  assert.ok(list.some(application=>application.sourceResult.id==='gen-asw26-fractional'));
  for(const application of list){
    assertApplication(application,entry);
    assert.equal(solvesId(application),problemId('Fractional dominating set'));
    assert.equal(application.result.problemScope.node,problemId('Fractional local covering'));
  }
  const simulation=recipe('Fractional dominating set','Covering LP','conditional');
  const simulated=applications(simulation);
  assert.ok(simulated.length,'an incidence-LP source is evaluated on its transformed instance');
  for(const application of simulated){
    assertApplication(application,simulation);
    assert.equal(application.sourceResult.problemScope.node,problemId('Covering LP'));
    assert.equal(solvesId(application),problemId('Fractional dominating set'));
  }
  assert.deepEqual(applications(recipe('MDS','Fractional dominating set','relaxation')),[]);
});

test('vertex-cover rounding follows the generated fractional theorem back to the original article',()=>{
  const entry=recipe('Vertex cover','Fractional vertex cover','conditional');
  const list=applications(entry);
  const chain=list.find(application=>application.derivedResult.reductionPath.length>1);
  assert.ok(chain,'at least one LP→fractional-cover→rounded-cover chain is compiled');
  assertApplication(chain,entry);
  assert.equal(chain.result.verification,'derived','the immediate solver can itself be a compiled consequence');
  assert.equal(chain.result.problemScope.node,problemId('Fractional vertex cover'));
  assert.equal(chain.sourceResult.verification,'primary');
  assert.equal(chain.sourceResult.problemScope.node,problemId('Covering LP'));
  assert.equal(chain.derivedResult.sourceUrl,chain.sourceResult.sourceUrl);
  assert.equal(chain.derivedResult.sota,undefined,'a chain does not inherit literature SOTA');
});

test('hardness follows certified identity specializations in the reverse problem direction',()=>{
  const entry=recipe('MDS','Local covering');
  const list=applications(entry,{bound:'lower'});
  assert.ok(list.length);
  for(const application of list){
    assertApplication(application,entry,'lower');
    assert.equal(application.result.problemScope.node,problemId('MDS'));
    assert.equal(solvesId(application),problemId('Local covering'));
  }
  const client=recipe('Client dominating set','Local covering');
  assert.deepEqual(applications(client,{bound:'lower'}),[],'a T+1 construction is not inverted without a certificate');
});

test('client domination retains its initialization round separately from its source',()=>{
  const entry=recipe('Client dominating set','Local covering');
  const list=applications(entry);
  assert.ok(list.length);
  for(const application of list){
    assertApplication(application,entry);
    assert.match(application.derivedResult.derivedMath.rounds,/\+1$/,'the setup round is retained in the compiled expression');
    assert.equal(application.result.rounds,byId[application.result.id].rounds);
  }
});

test('model selection filters the actual derived model and never silently gives CONGEST bandwidth',()=>{
  const entry=recipe('MDS','Local covering');
  const congest=applications(entry,{model:'CONGEST'});
  assert.ok(congest.length);
  assert.ok(congest.every(application=>application.derivedResult.model==='CONGEST'));
  assert.deepEqual(applications(entry,{model:'LOCAL'}),[],'an unchanged CONGEST theorem retains its actual model');
  assert.deepEqual(applications(entry,{model:'LOW'}),[]);
  const line=recipe('Edge dominating set','MDS','conditional');
  assert.deepEqual(applications(line,{model:'CONGEST'}),[],'line-graph simulation has no generic CONGEST certificate');
  assert.ok(applications(line,{model:'LOCAL'}).every(application=>application.derivedResult.model==='LOCAL'));
});

test('unresolved, secondary and claimed sources are excluded from compiled applications',()=>{
  const excluded=new Set(sourceRecords.filter(result=>result.verification!=='primary'||result.caveat||['claimed','withdrawn','retracted'].includes(result.status)).map(result=>result.id));
  for(const result of catalog.results.filter(result=>result.verification==='derived'))assert.equal(excluded.has(result.sourceResultId),false,result.id+' has an admissible original theorem');
});

test('reduction filters resolve aliases, kinds, statuses, models and empty states',()=>{
  const mds=problemId('MDS');
  const expected=core.reductions.filter(entry=>entry.from===mds||entry.to===mds).map(entry=>entry.id).sort();
  for(const reductionProblem of ['MDS',mds,'Dominating set'])assert.deepEqual(core.filteredReductions({reductionProblem}).map(entry=>entry.id).sort(),expected);
  for(const reductionKind of ['specialization','simulation','rounding','relaxation'])assert.ok(core.filteredReductions({reductionKind}).every(entry=>entry.kind===reductionKind));
  for(const reductionKind of ['automatic','conditional'])assert.ok(core.filteredReductions({reductionKind}).every(entry=>entry.status===reductionKind));
  for(const reductionModel of ['LOCAL','CONGEST','Anonymous'])assert.ok(core.filteredReductions({reductionModel}).every(entry=>entry.models.includes(reductionModel)));
  const entry=core.reductions[0];
  assert.ok(core.filteredReductions({reductionQ:entry.title}).some(result=>result.id===entry.id));
  assert.deepEqual(core.filteredReductions({reductionQ:'__definitely_no_reduction__'}),[]);
});

test('reduction ordering is deterministic and independent of source-file insertion order',()=>{
  const original=[...core.reductions],expected=core.filteredReductions({}).map(entry=>entry.id);
  try{core.reductions.reverse();assert.deepEqual(core.filteredReductions({}).map(entry=>entry.id),expected);}
  finally{core.reductions.splice(0,core.reductions.length,...original);}
});

test('a future general-graph result automatically applies to every included graph class',()=>{
  const source={...sourceRecords[0],id:'future-general-graph-algorithm',bound:'upper',graphClass:'General',graphScope:{node:'general'}};
  for(const graph of ['Planar','Trees','Bounded expansion','Outerplanar']){
    const match=core.graphMatch(source,{graph});
    assert.equal(match.matches,true,graph+' is included without a paper-specific rule');
    assert.equal(match.inherited,true);
    assert.ok(match.path.edges.length);
    assert.equal(core.filtered([source],{}, {graph}).length,1);
    assert.equal(core.filtered([source],{}, {graph,classTransfer:false}).length,0);
  }
  assert.equal(core.graphMatch(source,{graph:'General',classTransfer:false}).matches,true);
});

test('graph-class transitive closure also applies to generated consequences',()=>{
  const template=catalog.results.find(result=>result.verification==='derived');
  assert.ok(template);
  const result={...template,id:'future-compiled-expansion-algorithm',sourceResultId:'future-linked-paper',bound:'upper',graphClass:'Bounded expansion',graphScope:{node:'expansion'}};
  const match=core.graphMatch(result,{graph:'Planar'});
  assert.equal(match.matches,true);
  assert.ok(match.path.edges.length>1,'this compatibility is obtained by composing inclusion edges');
  assert.equal(match.path.nodes[0],core.resolveClass('Planar').id);
  assert.equal(match.path.nodes.at(-1),'expansion');
  assert.equal(core.filtered([result],{}, {graph:'Planar'}).length,1);
  assert.equal(core.filtered([result],{}, {graph:'Planar',classTransfer:false}).length,0);
  assert.equal(core.filtered([result],{}, {graph:'Planar',problemTransfer:false}).length,0,'the exact-problem toggle excludes generated consequences');
});

test('a newly declared class and inclusion edge are compiled without paper-specific or class-specific code',()=>{
  const graphNetwork=JSON.parse(JSON.stringify(core.graphNetwork));
  const fresh={id:'future-planar-family',label:'Future planar family',aliases:['FutureFamily'],search:true};
  graphNetwork.nodes.push(fresh);
  graphNetwork.edges.push({subset:fresh.id,superset:'planar',lower:true,reason:'Synthetic verified inclusion used by this regression.'});
  const context={ATLAS_DATA:{...catalog,graphNetwork}};
  vm.runInNewContext(readFileSync(resolve(__dirname,'../dist/core.js'),'utf8'),context);
  const freshCore=context.AtlasCore;
  assert.equal(freshCore.resolveClass('FutureFamily').id,fresh.id);
  const source={...sourceRecords[0],id:'future-class-solver',bound:'upper',graphClass:'General',graphScope:{node:'general'}};
  const inherited=freshCore.graphMatch(source,{graph:fresh.id});
  assert.equal(inherited.matches,true);
  assert.equal(inherited.path.nodes[0],fresh.id);
  assert.equal(inherited.path.nodes.at(-1),'general');
  assert.equal(inherited.path.edges.length,2,'the newly supplied edge composes with the existing planar inclusion');
  assert.equal(freshCore.filtered([source],{}, {graph:fresh.id}).length,1);
  assert.equal(freshCore.filtered([source],{}, {graph:fresh.id,classTransfer:false}).length,0);
  assert.equal(freshCore.searchContext({q:'FutureFamily'}).target.id,fresh.id,'new aliases also join free-text class recognition');
});

test('future lower bounds propagate toward containing graph classes, never toward subclasses',()=>{
  const lower={...sourceRecords[0],id:'future-planar-lower-bound',bound:'lower',graphClass:'Planar',graphScope:{node:'planar'}};
  assert.equal(core.graphMatch(lower,{graph:'General'}).matches,true);
  assert.equal(core.graphMatch(lower,{graph:'General',classTransfer:false}).matches,false);
  assert.equal(core.graphMatch(lower,{graph:'Trees'}).matches,false,'planar hardness does not imply tree hardness');
  const general={...lower,graphClass:'General',graphScope:{node:'general'}};
  assert.equal(core.graphMatch(general,{graph:'Planar'}).matches,false);
  const tree={...lower,graphClass:'Trees / forests',graphScope:{node:'forest'}};
  assert.equal(core.graphMatch(tree,{graph:'Bounded expansion'}).matches,false,'a non-certified lower inclusion edge blocks the reverse inference');
});

test('generated SOTA is limited to an explicitly reviewed projection of the exact target setting',()=>{
  const projected=catalog.results.find(result=>result.verification==='derived'&&result.sotaProjections?.length);
  assert.ok(projected,'the catalog carries at least one separately reviewed target certificate');
  assert.equal(projected.sota,undefined,'the source solver annotation is not blindly copied');
  const projection=projected.sotaProjections[0];
  const state={problem:projection.problem,graph:projection.graph};
  assert.equal(core.sotaApplies(projected,state),true,'the exact reviewed projection is highlighted');
  assert.equal(core.sotaContext(projected,state).transfer,projection);
  assert.equal(core.sotaApplies(projected,{problem:projection.problem,graph:'Trees'}),false,'the certificate does not spread to other subclasses');
  assert.equal(core.sotaApplies(projected,{problem:projection.problem}),false,'a class-specific frontier is not promoted to the whole source class');
  const unreviewed={...projected};delete unreviewed.sotaProjections;
  assert.equal(core.sotaApplies(unreviewed,state),false,'the mathematical reduction alone creates no SOTA judgement');
});
