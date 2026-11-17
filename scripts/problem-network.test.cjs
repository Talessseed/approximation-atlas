const {test} = require('node:test');
const assert = require('node:assert/strict');
const core = require('../dist/core.js');
const catalog = require('../dist/data/catalog.json');
const byId = Object.fromEntries(catalog.results.map(result => [result.id, result]));
const papers = Object.fromEntries(catalog.papers.map(paper => [paper.id, paper]));
const row = id => {
  assert.ok(byId[id], 'catalog fixture exists: '+id);
  return byId[id];
};
const node = value => {
  const resolved = core.resolveProblem(value);
  assert.ok(resolved, 'problem resolves: '+value);
  return resolved;
};
const scope = id => node(row(id).problemScope.node);
const visibleIds = state => new Set(core.filtered(catalog.results, papers, state).map(result => result.id));

test('problem scopes resolve for every catalog entry and aliases preserve existing links', () => {
  assert.ok(Array.isArray(core.problemNodes) && core.problemNodes.length > 15);
  assert.equal(new Set(core.problemNodes.map(problem => problem.id)).size, core.problemNodes.length);
  for (const result of catalog.results) {
    assert.ok(result.problemScope?.node, 'explicit problem scope: '+result.id);
    assert.ok(core.resolveProblem(result.problemScope.node), 'known scope: '+result.id);
  }
  const mds = node('Dominating set');
  for (const alias of ['MDS', mds.id, mds.label]) assert.equal(node(alias).id, mds.id);
  assert.equal(node('Covering LP').id, node('covering lp').id);
  assert.equal(core.resolveProblem('not-a-catalog-problem'), null);
});

test('integral local covering algorithms specialize to MDS while fractional output does not', () => {
  for (const problem of ['MDS', node('MDS').id, node('MDS').label]) {
    for (const id of ['gen-asw26-cover-det', 'gen-asw26-cover-random']) {
      const match = core.problemMatch(row(id), {problem});
      assert.equal(match.matches, true, id+' applies to '+problem);
      assert.equal(match.inherited, true, id+' has an inherited problem setting');
      assert.ok(match.path?.edges.length, id+' exposes its reduction path');
      assert.equal(core.matches(row(id), {problem}), true, id+' reaches the result filter');
    }
    for (const id of ['gen-asw26-fractional', 'unitdisk-fractional-domination', 'gen-low24-cover']) {
      assert.equal(core.problemMatch(row(id), {problem}).matches, false, id+' is fractional only');
      assert.equal(core.matches(row(id), {problem}), false, id+' is not an integral MDS result');
    }
  }
});

test('problem inheritance is enabled by default and can be disabled independently of graph inheritance', () => {
  const result = row('gen-asw26-cover-det');
  assert.equal(core.problemMatch(result, {problem:'MDS'}).matches, true);
  assert.equal(core.problemMatch(result, {problem:'MDS', problemTransfer:true}).matches, true);
  assert.equal(core.problemMatch(result, {problem:'MDS', problemTransfer:false}).matches, false);
  assert.equal(core.matches(result, {problem:'MDS', problemTransfer:false}), false);
  assert.equal(core.problemMatch(result, {problem:scope(result.id).id, problemTransfer:false}).matches, true);
  assert.equal(core.problemMatch(result, {}).inherited, false);
});

test('fractional domination finds its fractional local-covering specialization without promising LP simulation', () => {
  const target = scope('unitdisk-fractional-domination');
  const state = {problem:target.id};
  for (const id of ['unitdisk-fractional-domination', 'gen-asw26-fractional']) {
    assert.equal(core.problemMatch(row(id), state).matches, true, id);
    assert.equal(core.matches(row(id), state), true, id);
  }
  assert.equal(core.problemMatch(row('gen-asw26-fractional'), state).inherited, true);
  assert.equal(core.problemMatch(row('gen-low24-cover'), state).matches, false,
    'a generic variable–constraint incidence network needs a certified simulation');
  assert.equal(core.problemMatch(row('gen-asw26-cover-det'), state).matches, false,
    'an integral-optimum guarantee is not automatically a fractional-optimum guarantee');
});

test('graph-changing set-cover formulations are explanatory, not automatic planar MDS algorithms', () => {
  const state = {problem:'MDS', graph:'Planar'};
  assert.equal(core.matches(row('gen-asw26-setcover'), state), false);
  assert.equal(core.problemMatch(row('gen-asw26-setcover'), state).matches, false);
  const mds = node('MDS'), setCover = scope('gen-asw26-setcover');
  assert.ok(core.problemPath(mds.id, setCover.id, 'all'), 'the set-cover formulation remains visible in the network');
  assert.equal(core.problemPath(mds.id, setCover.id, 'upper'), null,
    'the formulation changes the communication graph');
  assert.equal(core.problemPath(mds.id, setCover.id, 'lower'), null,
    'no distributed lower-bound transfer is certified for that graph change');
});

test('certified problem paths use opposite query directions for algorithms and lower bounds', () => {
  const mds = node('MDS'), localCover = scope('gen-asw26-cover-det');
  for (const mode of ['upper', 'lower', 'all']) {
    const path = core.problemPath(mds.id, localCover.id, mode);
    assert.ok(path?.edges.length, mode+' has the graph-preserving specialization');
  }
  assert.equal(core.problemPath(localCover.id, mds.id, 'upper'), null);
  const lowerMds = {...row('gen-asw26-cover-det'), bound:'lower', problem:mds.label, problemScope:{node:mds.id}};
  const lowerLocal = {...row('gen-asw26-cover-det'), bound:'lower'};
  assert.equal(core.problemMatch(lowerMds, {problem:localCover.id}).matches, true,
    'hardness of the special problem applies to its generalization');
  assert.equal(core.problemMatch(lowerLocal, {problem:mds.id}).matches, false,
    'hardness of a general problem does not automatically apply to MDS');
});

test('total domination is normalized separately from ordinary domination', () => {
  const total = scope('gen-asw26-total');
  const alipour = row('alipour-trianglefree-total-16');
  assert.equal(scope(alipour.id).id, total.id);
  assert.equal(alipour.problem, total.label);
  assert.notEqual(total.id, node('MDS').id);
  assert.equal(core.matches(alipour, {problem:'MDS'}), false);
  assert.equal(core.matches(alipour, {problem:total.id}), true);
  assert.equal(core.problemMatch(row('gen-asw26-cover-det'), {problem:total.id}).matches, true);
});

test('connected domination transfers through compiled factor changes rather than identity paths', () => {
  const mds=node('MDS'),cds=node('Connected dominating set');
  for(const [from,to] of [[mds,cds],[cds,mds]]){
    assert.ok(core.problemPath(from.id,to.id,'all'),'the conditional relationship is visible');
    assert.equal(core.problemPath(from.id,to.id,'upper'),null,'a changed guarantee is not an unchanged algorithm import');
    assert.equal(core.problemPath(from.id,to.id,'lower'),null,'no uncertified connected-instance hardness transfer');
  }
  assert.equal(core.problemMatch(row('amiri-planar-connected'),{problem:mds.id}).matches,false,'the original CDS ratio is not relabelled as an MDS ratio');
  const ids=visibleIds({problem:mds.id});
  for(const source of ['amiri-planar-connected','minor-almost-connected','unitdisk-connected-2006','gen-bdgpsw26-connected']){
    const result=row('derived-'+source+'--mds-via-connected-domination');
    assert.ok(ids.has(result.id),'the compiled factor-three consequence is searchable');
    assert.equal(result.roundsDisplay,row(source).roundsDisplay,'the output reuse adds no communication');
    assert.equal(result.reductionSteps[0].multiplier.label,'3');
    assert.deepEqual(result.inputConditions,['input-connected']);
    assert.equal(result.approximationBenchmark,'integral');
    assert.equal(result.sota,undefined);assert.equal(result.tightness,undefined);
    assert.ok(result.setting.covered.includes('input-connected'));
  }
  const csv=core.csv([row('derived-amiri-planar-connected--mds-via-connected-domination')]);
  assert.ok(csv.includes('inputConditions')&&csv.includes('input-connected'),'CSV retains the connected-input restriction');
});

test('integral outputs measured against fractional OPT retain their integral scopes', () => {
  for (const id of ['gen-as26-planar', 'gen-as26-minor', 'gen-asw26-planar', 'gen-asw26-trianglefree', 'gen-asw26-minordensity']) {
    assert.equal(scope(id).id, node('MDS').id, id);
    assert.equal(core.problemMatch(row(id), {problem:'MDS'}).inherited, false, id);
  }
  assert.notEqual(scope('gen-asw26-setcover').id, scope('gen-asw26-fractional').id);
  assert.equal(scope('gen-as10-setcover').id, scope('gen-asw26-setcover').id);
  assert.equal(scope('gen-as10-vc').id, node('Vertex cover').id,
    'a fractional intermediate in the proof does not make the output fractional');
});

test('fractional matching, capacitated matching and distance vertex cover keep distinct scopes', () => {
  const matching = node('Maximum matching');
  for (const id of ['gen-ako18-fractional', 'pic-sublog-fmatching', 'pic-sublog-bmatching']) {
    assert.notEqual(scope(id).id, matching.id, id);
    assert.equal(core.problemMatch(row(id), {problem:matching.id, problemTransfer:false}).matches, false, id);
    assert.equal(core.problemMatch(row(id), {problem:scope(id).id, problemTransfer:false}).matches, true, id);
  }
  assert.notEqual(scope('pic-sublog-fmatching').id, scope('pic-sublog-bmatching').id);
  const vertexCover = node('Vertex cover');
  for (const id of ['pic-girth-cover-vc', 'pic-girth-cover-connected-vc']) {
    assert.notEqual(scope(id).id, vertexCover.id, id);
    assert.equal(core.problemMatch(row(id), {problem:vertexCover.id, problemTransfer:false}).matches, false, id);
  }
  assert.notEqual(scope('pic-girth-cover-vc').id, scope('pic-girth-cover-connected-vc').id);
});

test('distance-r vertex cover and its connected version are first-class problems with separate filters', () => {
  const ordinary = node('Vertex cover');
  const cases = [
    {id:'pic-girth-cover-vc', scope:'distance-vertex-cover', label:'Distance-r vertex cover', aliases:['Distance vertex cover','Distance-r VC']},
    {id:'pic-girth-cover-connected-vc', scope:'connected-distance-vertex-cover', label:'Distance-r connected vertex cover', aliases:['Connected distance-r vertex cover','Connected distance vertex cover','Connected distance-r VC']},
  ];
  const originals = require('../dist/data/picavet.json').results;
  for (const entry of cases) {
    const source = originals.find(result => result.id === entry.id), result = row(entry.id), problem = node(entry.label);
    assert.equal(problem.id, entry.scope);
    assert.equal(problem.label, entry.label);
    assert.equal(source.problem, entry.label, entry.id+' is categorized directly in the source data');
    assert.equal(catalog.problemNetwork.scopes[entry.label], entry.scope, entry.label+' has a reusable problem scope');
    assert.equal(catalog.problemNetwork.overrides[entry.id], undefined, entry.id+' needs no article-specific problem override');
    assert.equal(result.problem, entry.label);
    assert.equal(result.problemSource, 'Vertex cover', entry.id+' keeps its former catalog category as provenance');
    assert.equal(result.problemParameter, 'r');
    assert.equal(result.problemParameterName, 'distance radius');
    assert.equal(result.roundParameters.find(parameter => parameter.symbol === 'r').introduced, true,
      entry.id+' introduces the radius in the problem name');
    for (const field of ['approximation','rounds','graphClass','parameters','assumptions','sourceUrl','paperId','year','model','bound','randomization','verification','theorem'])
      assert.deepEqual(result[field], source[field], entry.id+' retains '+field);
    const selected = visibleIds({problem:entry.label});
    assert.ok(selected.has(entry.id));
    assert.ok([...selected].every(id => row(id).problemScope.node === entry.scope), entry.label+' does not import ordinary or connected/unconnected cover results');
    for (const alias of [entry.label, ...entry.aliases]) {
      assert.equal(node(alias).id, entry.scope, alias+' keeps its problem identity');
      assert.deepEqual([...visibleIds({problem:alias})].sort(), [...selected].sort(), alias+' keeps explicit problem filters');
      assert.deepEqual([...visibleIds({q:alias})].sort(), [...selected].sort(), alias+' is recognized as a complete problem in free-text search');
    }
    assert.equal(visibleIds({problem:ordinary.label}).has(entry.id), false, entry.id+' is not an ordinary vertex-cover result');
    const other = cases.find(candidate => candidate.id !== entry.id);
    assert.equal(selected.has(other.id), false, entry.label+' remains separate from '+other.label);
    assert.equal(core.problemMatch(row('gen-ps09-vc'), {problem:entry.label}).matches, false,
      'an ordinary vertex-cover algorithm is not relabelled as '+entry.label);
  }
});

test('free-text search combines graph and problem recognition while retaining author terms', () => {
  const context = core.searchContext({q:'planar MDS'});
  assert.equal(context.target.id, core.resolveClass('Planar').id);
  assert.equal(context.problemTarget.id, node('MDS').id);
  assert.equal(context.query.trim(), '');
  const authorContext = core.searchContext({q:'planar MDS Alipour'});
  assert.equal(authorContext.problemTarget.id, node('MDS').id);
  assert.ok(core.searchMatches(authorContext.query, 'Alipour'));
  assert.equal(core.searchMatches(authorContext.query, 'MDS'), false);
  assert.equal(core.matches(row('gen-asw26-cover-det'), {q:'planar MDS'}), true);
  assert.equal(core.matches(row('gen-asw26-fractional'), {q:'planar MDS'}), false);
  assert.equal(core.matches(row('gen-asw26-setcover'), {q:'planar MDS'}), false);
});

test('catalog problem filters expose inherited results with the same behavior as free text', () => {
  const explicit = visibleIds({problem:'MDS', graph:'Planar'});
  const searched = visibleIds({q:'planar MDS'});
  assert.deepEqual([...explicit].sort(), [...searched].sort());
  const visible = [...explicit].map(id => row(id));
  for (const id of ['gen-asw26-cover-det', 'gen-asw26-cover-random']) {
    const consequence = visible.find(result => result.sourceResultId === id && result.problemScope.node === node('MDS').id);
    assert.ok(consequence, id+' contributes a typed MDS consequence');
    assert.equal(consequence.verification, 'derived');
    assert.equal(explicit.has(id), false, 'the compiled consequence replaces its duplicate inherited source proxy');
  }
  for (const id of ['gen-asw26-fractional', 'unitdisk-fractional-domination', 'gen-low24-cover', 'gen-asw26-setcover', 'alipour-trianglefree-total-16']) {
    assert.equal(explicit.has(id), false, id+' is not relabelled as an integral planar MDS source');
  }
  assert.ok(visible.some(result => result.sourceResultId === 'gen-as10-setcover'),
    'a general-incidence set-cover solver is evaluated with the explicit simulation parameters');
  assert.equal(visible.some(result => result.sourceResultId === 'gen-asw26-setcover'), false,
    'a planar-incidence solver does not apply to the nonplanar closed-neighborhood construction');
  for (const id of ['gen-asw26-fractional', 'unitdisk-fractional-domination', 'gen-low24-cover'])
    assert.equal(visible.some(result => result.sourceResultId === id), false, id+' has no certified integral rounding');
});

test('source-setting SOTA is suppressed when the problem is inherited', () => {
  const source = {...row('gen-asw26-cover-det'), sota:{setting:'Integral local covering on the source graph class'}};
  assert.equal(core.sotaApplies(source, {problem:scope(source.id).id}), true);
  assert.equal(core.problemMatch(source, {problem:'MDS'}).inherited, true);
  assert.equal(core.sotaApplies(source, {problem:'MDS'}), false);
  assert.equal(core.matches(source, {problem:'MDS', sota:true}), false);
});

test('CSV exports retain the problem query and reduction provenance', () => {
  const queryProblem = node('MDS').label;
  const problemReductionPath = 'MDS → integral local covering';
  const csv = core.csv([{...row('gen-asw26-cover-det'), queryProblem, problemTransfer:true, problemReductionPath}]);
  const header = csv.split('\r\n')[0].split(',');
  for (const field of ['queryProblem', 'problemTransfer', 'problemReductionPath']) assert.ok(header.includes(field), field);
  assert.ok(csv.includes('"'+queryProblem+'"'));
  assert.ok(csv.includes('"true"'));
  assert.ok(csv.includes('"'+problemReductionPath+'"'));
});
