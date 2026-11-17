const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../dist/core.js');
const catalog=require('../dist/data/catalog.json');
const byId=Object.fromEntries(catalog.results.map(result=>[result.id,result]));
const papers=Object.fromEntries(catalog.papers.map(paper=>[paper.id,paper]));
const row=id=>{assert.ok(byId[id],'catalog fixture exists: '+id);return byId[id];};

test('tightness certificates identify the matched quantity, both proof sources and exact application scopes',()=>{
  const policy=core.tightBounds;
  assert.ok(policy.certificates.length>0);
  const certificateIds=new Set(),models=new Set(['LOCAL','CONGEST','Anonymous','SUPPORTED']);
  const classes=new Set(core.graphNodes.map(node=>node.id));
  const problems=new Set(core.problemNodes.map(node=>node.id));
  for(const certificate of policy.certificates){
    assert.ok(certificate.id&&!certificateIds.has(certificate.id),'certificate IDs are unique');
    certificateIds.add(certificate.id);
    assert.ok(['ratio','rounds','approximation-order'].includes(certificate.axis));
    assert.ok(['exact','asymptotic','threshold'].includes(certificate.precision));
    for(const field of ['scopeLabel','parameterDomain','statement'])assert.ok(typeof certificate[field]==='string'&&certificate[field].trim(),certificate.id+': '+field);
    for(const side of ['upper','lower']){
      const proof=certificate[side];
      assert.ok(Array.isArray(proof.resultIds),certificate.id+': external counterparts may have no catalog row');
      for(const id of proof.resultIds)assert.equal(row(id).bound,side,certificate.id+': the proof-side IDs have the right bound direction');
      assert.equal(new URL(proof.url).protocol,'https:',certificate.id+': primary source link');
      for(const field of ['title','location','statement'])assert.ok(typeof proof[field]==='string'&&proof[field].trim(),certificate.id+': '+side+' '+field);
    }
    assert.ok(certificate.applications.length>0,certificate.id+': an explicit application is required');
    for(const application of certificate.applications){
      const result=row(application.resultId);
      assert.ok(certificate[result.bound].resultIds.includes(result.id),certificate.id+': each application belongs to the matching proof side');
      assert.ok(result.verification==='primary'||(result.verification==='derived'&&result.sourceVerification==='primary'),certificate.id+': applications use primary-source bounds');
      assert.ok(!result.caveat&&result.status!=='claimed',certificate.id+': an unresolved bound cannot be certified tight');
      for(const [field,known] of [['graphs',classes],['problems',problems],['models',models]]){
        assert.ok(Array.isArray(application[field])&&application[field].length>0,certificate.id+': '+field+' is explicit');
        assert.ok(application[field].every(value=>known.has(value)),certificate.id+': '+field+' contains known IDs');
      }
      assert.ok(result.tightness?.some(compiled=>compiled.certificateId===certificate.id),certificate.id+': the reviewed application is compiled onto its result');
    }
  }
  for(const result of catalog.results)for(const application of result.tightness||[]){
    assert.ok(certificateIds.has(application.certificateId),result.id+': the certificate exists');
    const certificate=policy.certificates.find(item=>item.id===application.certificateId);
    const declared=certificate.applications.find(item=>item.resultId===result.id);
    assert.ok(declared,result.id+': metadata cannot be inherited without a reviewed application');
    for(const field of ['graphs','problems','models'])assert.deepEqual([...application[field]].sort(),[...declared[field]].sort(),result.id+': compiled '+field+' keep the reviewed scope');
  }
});

test('matching outerplanar upper and lower bounds are explicitly tight',()=>{
  for(const id of ['outerplanar-five','outerplanar-five-lower']){
    const result=row(id),context=core.tightContext(result,{});
    assert.equal(context.status,'tight',id);
    assert.equal(core.tightApplies(result,{}),true,id);
    assert.ok(context.certificates.length>0,id+' has a matching-bound certificate');
    assert.ok(context.sourceCertificates.length>0,id+' retains the source certificate');
  }
  assert.equal(row('outerplanar-five').bound,'upper');
  assert.equal(row('outerplanar-five-lower').bound,'lower');
});

test('tightness is independent of Pareto dominance and best-known status',()=>{
  const planar=row('gen-asw26-planar');
  assert.equal(core.sotaContext(planar,{}).status,'dominated');
  assert.equal(core.tightContext(planar,{}).status,'tight','a larger-class improvement does not undo the matching planar factor lower bound');
  const bestKnown=row('gen-dp26-matching');
  assert.equal(core.sotaApplies(bestKnown,{}),true);
  assert.equal(core.tightApplies(bestKnown,{}),false,'a best-known upper bound without a match is not tight');
  assert.equal(core.tightContext(bestKnown,{}).status,'unreviewed');
});

test('an outerplanar coefficient match is not promoted to the harder planar setting',()=>{
  const result=row('outerplanar-five-lower'),state={graph:'Planar'};
  assert.equal(core.graphMatch(result,state).matches,true,'the lower bound itself still applies through its witness subclass');
  const context=core.tightContext(result,state);
  assert.equal(context.status,'source-only');
  assert.equal(context.certificates.length,0);
  assert.ok(context.sourceCertificates.length>0);
  assert.equal(core.tightApplies(result,state),false,'planar domination has a different matching coefficient');
});

test('a tree/path round match does not imply tightness for general graphs',()=>{
  const lower=row('gen-fk25-path-lower'),upper=row('gen-fk25-tree');
  assert.equal(core.tightApplies(lower,{}),true);
  assert.equal(core.tightApplies(upper,{}),true);
  const state={graph:'General'};
  assert.equal(core.graphMatch(lower,state).matches,true,'the path witness is also a valid general-graph lower bound');
  assert.equal(core.tightContext(lower,state).status,'source-only','the tree upper bound does not match general-graph complexity');
  assert.equal(core.tightApplies(lower,state),false);
});

test('model implications require an explicit tightness model certificate',()=>{
  const result=row('gen-as10-vc'),state={model:'LOCAL',transfer:true};
  assert.equal(result.model,'Anonymous');
  assert.equal(core.matches(result,state),true,'the anonymous upper algorithm can be included in a LOCAL view');
  assert.ok(result.tightness?.length,'the anonymous result has a reviewed source match');
  const certified=result.tightness.some(application=>application.models.includes('LOCAL'));
  assert.equal(core.tightContext(result,state).status,certified?'tight':'source-only','model compatibility of an algorithm alone never certifies a matching lower bound');
  assert.equal(core.tightApplies(result,state),certified);
});

test('unreviewed reduction consequences do not inherit a solver tightness label',()=>{
  const plain=row('derived-gen-asw26-cover-det--total-domination-to-local-covering');
  assert.equal(plain.verification,'derived');
  assert.ok(!plain.tightness?.length,'a solver certificate is not copied to a different output problem');
  assert.equal(core.tightContext(plain,{}).status,'unreviewed');
  assert.equal(core.tightApplies(plain,{}),false);
});

test('a separately reviewed derived MDS bound can receive its own tightness certificate',()=>{
  const derived=row('derived-gen-asw26-cover-det--mds-to-local-covering');
  assert.equal(derived.verification,'derived');
  const context=core.tightContext(derived,{problem:'MDS',graph:'Planar'});
  assert.equal(context.status,'tight');
  const match=context.certificates.find(certificate=>certificate.id==='dominating-logstar-rounds');
  assert.ok(match,'the reviewed MDS specialization has its own matching round lower bound');
  assert.equal(match.axis,'rounds');
  assert.equal(match.precision,'asymptotic');
  assert.ok(match.parameterDomain.includes('fixed'),'the match keeps its fixed-parameter restriction');
  assert.equal(core.tightApplies(derived,{problem:'Total dominating set',graph:'Planar'}),false,'the MDS proof does not certify a different output problem');
});

test('tightness annotations do not change the existing catalog order or membership',()=>{
  const withoutTightness=catalog.results.map(result=>{
    const copy={...result};delete copy.tightness;return copy;
  });
  for(const state of [{},{problem:'MDS',graph:'Planar'},{sort:'problem'},{sort:'newest'},{bound:'lower'},{sota:true}]){
    const ids=results=>core.filtered(results,papers,state).map(result=>result.id);
    assert.deepEqual(ids(catalog.results),ids(withoutTightness),JSON.stringify(state));
  }
});

test('tight-only selects both proof directions independently of SOTA and combines with other filters',()=>{
  const sample=['outerplanar-five','outerplanar-five-lower','gen-asw26-planar','gen-dp26-matching'].map(row);
  const ids=state=>core.filtered(sample,papers,state).map(result=>result.id).sort();
  assert.deepEqual(ids({tight:true}),['outerplanar-five','outerplanar-five-lower','gen-asw26-planar'].sort());
  assert.deepEqual(ids({tight:true,bound:'lower'}),['outerplanar-five-lower']);
  assert.deepEqual(ids({tight:true,bound:'upper'}),['outerplanar-five','gen-asw26-planar'].sort());
  assert.deepEqual(ids({tight:true,sota:true}),['outerplanar-five'],'dominated tight bounds and unmatched SOTA bounds are distinct');
  assert.deepEqual(ids({tight:true,constantRatio:true}),['outerplanar-five','gen-asw26-planar'].sort());
  for(const state of [{},{problem:'MDS',graph:'Planar'},{sota:true},{bound:'lower'},{sort:'newest'}]){
    assert.deepEqual(core.filtered(catalog.results,papers,{...state,tight:false}),core.filtered(catalog.results,papers,state),'disabling Tight preserves membership and order');
  }
});

test('tight-only rejects source-only certificates under graph and model inheritance',()=>{
  for(const [id,state] of [
    ['outerplanar-five-lower',{graph:'Planar'}],
    ['gen-fk25-path-lower',{graph:'General'}],
    ['gen-as10-vc',{model:'LOCAL',transfer:true}],
    ['gen-ghs12-eds',{model:'CONGEST',transfer:true}],
  ]){
    assert.equal(core.matches(row(id),state),true,id+' is applicable without a matching upper/lower certificate in this query');
    assert.equal(core.matches(row(id),{...state,tight:true}),false,id+' must not be promoted to Tight by inheritance');
  }
});

test('tight-only retains reviewed problem reductions and exact parameter qualifications',()=>{
  const reviewed=row('derived-gen-asw26-cover-det--mds-to-local-covering');
  const unreviewed=row('derived-gen-asw26-cover-det--total-domination-to-local-covering');
  assert.equal(core.matches(reviewed,{problem:'MDS',graph:'Planar',tight:true}),true);
  assert.equal(core.matches(unreviewed,{problem:'Total dominating set',graph:'Planar',tight:true}),false);
  for(const id of ['gen-ghs12-eds','pic-girth-sublinear']){
    assert.equal(core.matches(row(id),{tight:true}),true,id+' has an explicitly reviewed match');
    assert.equal(core.matches(row(id),{tight:true,constantRatio:true}),false,id+' retains its parameter-dependent factor');
  }
  assert.equal(core.matches(row('outerplanar-five'),{tight:true,model:'LOCAL',transfer:true}),true,'explicitly certified model transfers remain available');
});
