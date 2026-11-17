(function (root) {
  'use strict';
  const roundLabels = {constant:'Constant rounds',parameter:'Parameter-dependent rounds',logstar:'Iterated logarithmic rounds',degree:'Degree / weight dependent',logarithmic:'Logarithmic rounds',polylog:'Polylogarithmic rounds',other:'Other round complexities'};
  const roundOrder = Object.keys(roundLabels);
  const collator = new Intl.Collator('en', {numeric:true, sensitivity:'base'});
  const compareText = (a,b) => collator.compare(String(a ?? ''),String(b ?? ''));
  const modelOrder = ['LOCAL','CONGEST','Anonymous','SUPPORTED'];
  const typeOrder = ['Deterministic','Randomized','Unspecified'];
  const normalize = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function searchText(value) {
    return normalize(value)
      .replace(/\\nabla\s*_\s*\{?1\}?|∇_?1|\bnabla_?1\b/g, ' nabla1 ')
      .replace(/\\(?:varepsilon|epsilon)\b/g, ' epsilon ')
      .replace(/\\(delta|alpha|beta|gamma|rho|eta|omega)\b/g, ' $1 ')
      .replace(/[εϵδαβγρηω]/g, c => ' '+({'ε':'epsilon','ϵ':'epsilon','δ':'delta','α':'alpha','β':'beta','γ':'gamma','ρ':'rho','η':'eta','ω':'omega'}[c])+' ')
      .replace(/\\?log\s*(?:\^\{?\*\}?|\*|[- ]star)/g, ' logstar ')
      .replace(/[−–]/g, '-').replace(/\s+/g, ' ').trim();
  }
  function searchMatches(text, query) {
    const haystack = searchText(text);
    return searchText(query).split(' ').filter(Boolean).every(term =>
      haystack.includes(term) || (/[+−\-^/=\d]/.test(term) && haystack.replace(/\s/g,'').includes(term)));
  }
  const graphNetwork = typeof module !== 'undefined' && module.exports
    ? require('./data/graph-classes.json') : root.ATLAS_DATA?.graphNetwork || {nodes:[],edges:[],scopes:{},references:{}};
  const problemNetwork = typeof module !== 'undefined' && module.exports
    ? require('./data/problems.json') : root.ATLAS_DATA?.problemNetwork || {nodes:[],edges:[],scopes:{},overrides:{},references:{}};
  const reductionsData = typeof module !== 'undefined' && module.exports
    ? require('./data/reductions.json') : root.ATLAS_DATA?.reductions || {entries:[]};
  const reductions = reductionsData.entries;
  const reductionResults = typeof module !== 'undefined' && module.exports
    ? require('./data/catalog.json').results : root.ATLAS_DATA?.results || [];
  const publicationSources = (typeof module !== 'undefined' && module.exports
    ? require('./data/catalog.json').sourceResults : root.ATLAS_DATA?.sourceResults)
    || reductionResults.filter(r=>r.verification!=='derived');
  const resultIndex = new Map(reductionResults.map(r=>[r.id,r]));
  const frontierData = (typeof module !== 'undefined' && module.exports
    ? require('./data/catalog.json').sotaFrontier : root.ATLAS_DATA?.sotaFrontier) || {};
  const algorithmSpecializations = new Map((frontierData.algorithmSpecializations||[]).map(c=>[c.id,c]));
  const tightBounds = (typeof module !== 'undefined' && module.exports
    ? require('./data/catalog.json').tightBounds : root.ATLAS_DATA?.tightBounds) || {certificates:[]};
  const tightMap = new Map(tightBounds.certificates.map(c=>[c.id,c]));
  const problemNodes = problemNetwork.nodes;
  const problemMap = Object.fromEntries(problemNodes.map(n=>[n.id,n]));
  const problemAliases = new Map();
  const problemNames = node => [node.id,node.label,...node.aliases,...(node.parameter?.values||[]).map(value=>node.parameter.template.replace('{parameter}',value))];
  for(const node of problemNodes)for(const name of problemNames(node))problemAliases.set(normalize(name),node);
  function resolveProblem(value){return problemAliases.get(normalize(value))||null;}
  const publicationsByProblem=new Map(problemNodes.map(node=>[node.id,new Set()])),publications=new Set();
  for(const result of publicationSources){
    if(result.verification==='derived'||result.attribution==='folklore'||!result.paperId)continue;
    const group=publicationsByProblem.get(problemScope(result)?.node);
    if(group){group.add(result.paperId);publications.add(result.paperId);}
  }
  function problemPublicationCount(value){
    if(value==null||value==='')return publications.size;
    return publicationsByProblem.get(resolveProblem(value)?.id)?.size||0;
  }
  function compareProblems(a,b){
    return problemPublicationCount(b)-problemPublicationCount(a)||compareText(a,b);
  }
  const problemPaths=new Map();
  function problemPath(special,general,mode='upper'){
    const from=resolveProblem(special)?.id,to=resolveProblem(general)?.id;
    if(!from||!to||!['upper','lower','all'].includes(mode))return null;
    const key=from+'>'+to+':'+mode;
    if(problemPaths.has(key))return problemPaths.get(key);
    const queue=[{nodes:[from],edges:[]}],seen=new Set([from]);
    while(queue.length){
      const path=queue.shift(),last=path.nodes.at(-1);
      if(last===to){problemPaths.set(key,path);return path;}
      for(const edge of problemNetwork.edges)if(edge.special===last&&(mode==='all'||edge[mode])&&!seen.has(edge.general)){
        seen.add(edge.general);queue.push({nodes:[...path.nodes,edge.general],edges:[...path.edges,edge]});
      }
    }
    problemPaths.set(key,null);return null;
  }
  function problemScope(result){
    if(result.problemScope)return result.problemScope;
    const value=problemNetwork.overrides[result.id]||problemNetwork.scopes[result.problem];
    return value?{node:typeof value==='string'?value:value.node}:resolveProblem(result.problem)?{node:resolveProblem(result.problem).id}:null;
  }
  function filteredReductions(state={}){
    const problem=resolveProblem(state.reductionProblem);
    if(state.reductionProblem&&!problem)return [];
    return reductions.filter(r=>{
      if(problem&&r.from!==problem.id&&r.to!==problem.id)return false;
      if(state.reductionModel&&!r.models.includes(state.reductionModel))return false;
      if(state.reductionKind&&r.status!==state.reductionKind&&r.kind!==state.reductionKind)return false;
      return searchMatches([r.title,resolveProblem(r.from)?.label,resolveProblem(r.to)?.label,r.summary,r.kind,r.status,
        r.models.join(' '),r.runtime,r.guarantee,...Object.values(r.instance),...r.conditions,r.source.title,r.source.location].join(' '),state.reductionQ||'');
    }).sort((a,b)=>compareProblems(resolveProblem(a.from)?.label,resolveProblem(b.from)?.label)||
      compareProblems(resolveProblem(a.to)?.label,resolveProblem(b.to)?.label)||compareText(a.title,b.title)||compareText(a.id,b.id));
  }
  function reductionApplications(entry,options={}){
    const recipe=typeof entry==='string'?reductions.find(r=>r.id===entry):entry,bound=options.bound||'upper';
    if(!recipe?.engine||!recipe.engine[bound]||!['upper','lower'].includes(bound))return [];
    const byId=Object.fromEntries(reductionResults.map(r=>[r.id,r]));
    const candidates=reductionResults.filter(r=>r.verification==='derived'&&r.bound===bound&&r.reductionPath?.[0]===recipe.id&&(!options.model||r.model===options.model));
    return filtered(candidates,{},{}).map(derivedResult=>({
      result:byId[derivedResult.parentResultId],sourceResult:byId[derivedResult.sourceResultId],derivedResult,
      solves:resolveProblem(problemScope(derivedResult).node),runtime:derivedResult.roundsDisplay,
      guarantee:derivedResult.approximationDisplay,conversion:recipe.runtime,
      notes:[...recipe.conditions,derivedResult.assumptions],automatic:true,reductionId:recipe.id
    }));
  }
  const graphNodes = graphNetwork.nodes;
  const scopeByName = {...graphNetwork.scopes};
  for(const [source,canonical] of Object.entries(graphNetwork.displayAliases||{}))scopeByName[canonical]=graphNetwork.scopes[source];
  const nodeMap = Object.fromEntries(graphNodes.map(n=>[n.id,n]));
  const classAliases = new Map();
  for (const node of graphNodes) for (const name of [node.id,node.label,...node.aliases]) classAliases.set(normalize(name),node);
  const outgoing = Object.fromEntries(graphNodes.map(n=>[n.id,graphNetwork.edges.filter(e=>e.subset===n.id)]));
  const pathCache = new Map();
  function resolveClass(value) {return classAliases.get(normalize(value)) || null;}
  function inclusionPath(subset,superset,lowerOnly=false) {
    const from=resolveClass(subset)?.id,to=resolveClass(superset)?.id;
    if(!from||!to)return null;
    const key=from+'>'+to+(lowerOnly?':lower':'');
    if(pathCache.has(key))return pathCache.get(key);
    const queue=[{nodes:[from],edges:[]}],seen=new Set([from]);
    while(queue.length){
      const path=queue.shift(),last=path.nodes.at(-1);
      if(last===to){pathCache.set(key,path);return path;}
      for(const edge of outgoing[last])if((!lowerOnly||edge.lower)&&!seen.has(edge.superset)){
        seen.add(edge.superset);queue.push({nodes:[...path.nodes,edge.superset],edges:[...path.edges,edge]});
      }
    }
    pathCache.set(key,null);return null;
  }
  function graphScope(result) {
    return result.graphScope || scopeByName[result.graphClass] || (resolveClass(result.graphClass)?{node:resolveClass(result.graphClass).id}:null);
  }
  function graphTags(value) {
    const scope=graphScope({graphClass:value});
    return scope?graphNodes.filter(n=>inclusionPath(scope.node,n.id)).map(n=>n.label):['Other classes'];
  }
  const queryAliases=graphNodes.filter(n=>n.search).flatMap(n=>[n.label,...n.aliases].map(alias=>({node:n,alias:normalize(alias)}))).sort((a,b)=>b.alias.length-a.alias.length);
  const problemQueryAliases=problemNodes.flatMap(n=>problemNames(n).filter(name=>name!==n.id).map(alias=>({node:n,alias:normalize(alias)}))).sort((a,b)=>b.alias.length-a.alias.length);
  function recognize(query,aliases){
    for(const entry of aliases){
      const escaped=entry.alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
      const match=new RegExp('(^|[^a-z0-9])('+escaped+')(?=$|[^a-z0-9])','i').exec(query);
      if(match)return {node:entry.node,start:match.index+match[1].length,end:match.index+match[0].length};
    }
    return null;
  }
  const contextCache=new Map();
  function searchContext(state={}) {
    const key=JSON.stringify([state.graph||'',state.problem||'',state.q||'']);
    if(contextCache.has(key))return contextCache.get(key);
    const q=normalize(state.q||'');
    const found=recognize(q,queryAliases);
    const explicit=resolveClass(state.graph),target=explicit||found?.node||null;
    let query=found&&(!explicit||explicit.id===found.node.id)?(q.slice(0,found.start)+' '+q.slice(found.end)).trim():q;
    const foundProblem=recognize(query,problemQueryAliases),explicitProblem=resolveProblem(state.problem);
    const problemTarget=explicitProblem||foundProblem?.node||null;
    if(foundProblem&&(!explicitProblem||explicitProblem.id===foundProblem.node.id))query=(query.slice(0,foundProblem.start)+' '+query.slice(foundProblem.end)).trim();
    const context={target,problemTarget,query,fromSearch:!!target&&!explicit,problemFromSearch:!!problemTarget&&!explicitProblem};
    if(contextCache.size>=100)contextCache.delete(contextCache.keys().next().value);
    contextCache.set(key,context);return context;
  }
  function classMatch(result,target,inclusions=true) {
    const node=typeof target==='object'?target:resolveClass(target),scope=graphScope(result);
    if(!node)return {matches:true,inherited:false,path:null,target:null,source:null};
    if(!scope)return {matches:false,inherited:false,path:null,target:node,source:null};
    const source=nodeMap[scope.node],direct=source.id===node.id;
    const path=direct?{nodes:[source.id],edges:[]}:inclusions
      ?(result.bound==='lower'?inclusionPath(source.id,node.id,true):inclusionPath(node.id,source.id)) : null;
    const parameterBindings={};
    for(const [role,symbol] of Object.entries(result.graphParameterRoles||{})){
      const values=[...new Set((path?.edges||[]).map(e=>e.parameterBindings?.[role]).filter(Boolean))];
      if(values.length===1)parameterBindings[role]={symbol,value:values[0]};
    }
    return {matches:!!path,inherited:!!path&&!direct,path,target:node,source,scope,parameterBindings};
  }
  function graphMatch(result,state={}) {
    return classMatch(result,searchContext(state).target,state.classTransfer!==false);
  }
  function problemMatch(result,state={}){
    const target=searchContext(state).problemTarget,scope=problemScope(result),source=scope?problemMap[scope.node]:null;
    if(!target)return {matches:!state.problem,inherited:false,path:null,target:null,source,scope};
    if(!source)return {matches:false,inherited:false,path:null,target,source:null,scope};
    const direct=source.id===target.id;
    const path=direct?{nodes:[source.id],edges:[]}:state.problemTransfer!==false
      ?(result.bound==='lower'?problemPath(source.id,target.id,'lower'):problemPath(target.id,source.id,'upper')):null;
    return {matches:!!path,inherited:!!path&&!direct,path,target,source,scope};
  }
  function matchedScopeTransfer(result,state={}){
    const graph=graphMatch(result,state),problem=problemMatch(result,state);
    if(!graph.matches||!problem.matches)return null;
    if(result.sotaProjections?.length){
      return result.sotaProjections.find(t=>!problem.inherited&&
        (!t.graph||(graph.target?.id||graph.source?.id)===t.graph)&&
        t.problem===(problem.target?.id||problem.source?.id))||null;
    }
    if(!graph.inherited&&!problem.inherited)return null;
    return (result.sotaScopeTransfers||[]).find(t=>
      (graph.inherited?t.graph===graph.target?.id:!t.graph||t.graph===graph.target?.id)&&
      (problem.inherited?t.problem===problem.target?.id:!t.problem||t.problem===problem.target?.id))||null;
  }
  function effectiveApproximation(result,state={}){
    // Only an explicit certificate can instantiate the guarantee in a query.
    // Its validity is independent of whether this result is on the frontier.
    const specialization=matchedScopeTransfer(result,state)?.approximation||null;
    return {
      approximationDisplay:specialization?.factor??result.approximationDisplay??result.approximation,
      approximationBenchmark:result.approximationBenchmark,
      constantApproximation:specialization?specialization.constantApproximation===true:result.constantApproximation===true,
      specialization,
    };
  }
  function effectiveRounds(result,state={}){
    const transfer=matchedScopeTransfer(result,state);
    const certificate=algorithmSpecializations.get(transfer?.algorithmSpecialization);
    const source=certificate&&resultIndex.get(certificate.sourceResultId);
    const selected=source||result;
    let detail=selected.roundComplexityDetails;
    if(source&&detail){
      const evidence=[...(detail.evidence||[]),...certificate.evidence];
      detail={...detail,basis:'same-algorithm-specialization',sourceBasis:detail.basis,
        derivedFrom:source.id,explanation:detail.explanation+' '+certificate.reason,
        evidence:evidence.filter((item,index)=>evidence.findIndex(other=>other.url===item.url&&other.location===item.location)===index)};
    }
    return {roundsDisplay:selected.roundsDisplay||selected.rounds,roundClass:selected.roundClass,
      roundParameters:selected.roundParameters,roundComplexityDetails:detail,
      parameterDefinitions:source?.parameterDefinitions||[],specialization:source?certificate:null};
  }
  function sotaContext(result,state={}){
    if(result.dominatedBy?.length)return {status:'dominated',annotation:result.sota||null,transfer:null};
    if(result.sotaProjections?.length){
      const projection=matchedScopeTransfer(result,state);
      return {status:projection?'frontier':'unreviewed',annotation:projection||null,transfer:projection||null};
    }
    if(!result.sota)return {status:'unreviewed',annotation:null,transfer:null};
    const graph=graphMatch(result,state),problem=problemMatch(result,state);
    if(!graph.matches||!problem.matches)return {status:'source-only',annotation:result.sota,transfer:null};
    if(!graph.inherited&&!problem.inherited)return {status:'frontier',annotation:result.sota,transfer:null};
    const transfer=matchedScopeTransfer(result,state);
    return {status:transfer?'frontier':'source-only',annotation:result.sota,transfer:transfer||null};
  }
  function sotaApplies(result,state={}) {return sotaContext(result,state).status==='frontier';}
  function tightContext(result,state={}) {
    const sourceCertificates=(result.tightness||[]).map(application=>{
      const certificate=tightMap.get(application.certificateId);
      return certificate?{...certificate,application}:null;
    }).filter(Boolean);
    if(!sourceCertificates.length)return {status:'unreviewed',certificates:[],sourceCertificates:[]};
    const graph=graphMatch(result,state),problem=problemMatch(result,state);
    const graphId=graph.target?.id||graphScope(result)?.node;
    const problemId=problem.target?.id||problemScope(result)?.node;
    const model=state.model||result.model;
    const certificates=sourceCertificates.filter(c=>graph.matches&&problem.matches&&
      c.application.graphs.includes(graphId)&&c.application.problems.includes(problemId)&&c.application.models.includes(model));
    return {status:certificates.length?'tight':'source-only',certificates,sourceCertificates};
  }
  function tightApplies(result,state={}) {return tightContext(result,state).status==='tight';}
  function matches(result, state, paper) {
    if(state.problemTransfer===false&&result.verification==='derived')return false;
    if (state.paper && result.paperId !== state.paper) return false;
    if (!problemMatch(result,state).matches) return false;
    if (!graphMatch(result,state).matches) return false;
    if (state.bound && result.bound !== state.bound) return false;
    if (state.randomization && result.randomization !== state.randomization) return false;
    if (state.verification && result.verification !== state.verification) return false;
    if (state.round && effectiveRounds(result,state).roundClass !== state.round) return false;
    if (state.sota && !sotaApplies(result,state)) return false;
    if (state.tight && !tightApplies(result,state)) return false;
    if (state.constantRatio && !effectiveApproximation(result,state).constantApproximation) return false;
    if (state.model && result.model !== state.model) {
      if (!state.transfer) return false;
      const compatible = result.bound === 'upper'
        ? state.model === 'LOCAL' && ['CONGEST','Anonymous'].includes(result.model)
        : state.model === 'CONGEST' && result.model === 'LOCAL';
      if (!compatible) return false;
    }
    const query=searchContext(state).query;
    if (!query) return true;
    const rounds=effectiveRounds(result,state),approximation=effectiveApproximation(result,state);
    const text = [result.problem,result.problemSource,result.variant,result.graphClass,result.graphClassSource,result.model,result.approximation,result.sourceMath?.approximation,result.sourceMath?.approximationDisplay,result.rounds,result.roundsDisplay,rounds.roundsDisplay,result.approximationDisplay,approximation.approximationDisplay,approximation.approximationBenchmark==='fractional'?'OPT_f fractional optimum':'',result.roundParameters?.map(p=>p.name+' '+p.symbol).join(' '),result.parameterDefinitions?.map(p=>p.symbol+' '+p.description).join(' '),result.parameters,result.assumptions,result.summary,result.attribution,result.algorithm,result.proofSketch,paper?.title,paper?.authors,paper?.venue,paper?.type,result.year].join(' ');
    return searchMatches(text, query);
  }
  function filtered(results, papers, state) {
    let list = results.filter(r => matches(r,state,papers[r.paperId]));
    // Catalog consequences are compiled with their actual costs and instance
    // guards. A formulation path alone must never bypass those checks.
    if(searchContext(state).problemTarget&&reductionResults.some(r=>r.verification==='derived'))
      list=list.filter(r=>!problemMatch(r,state).inherited);
    const regime = (a,b) => roundOrder.indexOf(a.roundClass)-roundOrder.indexOf(b.roundClass);
    const setting = (a,b) => compareText(a.graphClass,b.graphClass) ||
      compareText(a.variant,b.variant) || compareText(a.objective,b.objective) ||
      modelOrder.indexOf(a.model)-modelOrder.indexOf(b.model) ||
      typeOrder.indexOf(a.randomization)-typeOrder.indexOf(b.randomization) ||
      (a.bound === 'lower')-(b.bound === 'lower');
    const ties = (a,b) => compareText(a.paperId,b.paperId) || compareText(a.id,b.id) ||
      String(a.id).localeCompare(String(b.id),'en');
    return list.sort((a,b) => {
      const problem = compareProblems(a.problem,b.problem);
      if (state.sort === 'newest') return b.year-a.year || regime(a,b) || problem || setting(a,b) || ties(a,b);
      if (state.sort === 'oldest') return a.year-b.year || regime(a,b) || problem || setting(a,b) || ties(a,b);
      if (state.sort === 'problem') return problem || b.year-a.year || regime(a,b) || setting(a,b) || ties(a,b);
      return regime(a,b) || problem || b.year-a.year || setting(a,b) || ties(a,b);
    });
  }
  function csv(rows) {
    const fields = ['id','problem','problemSource','problemParameter','problemParameterName','variant','bound','approximation','approximationDisplay','rounds','roundsDisplay','roundClass','graphClass','graphClassSource','model','randomization','parameters','assumptions','attribution','algorithm','proofSketch','proofFormula','provenanceNote','derivationNote','year','paperId','paperTitle','authors','venue','theorem','verification','status','caveat','caveatUrl','sourceUrl','relatedResults','prerequisite','queryGraphClass','classTransfer','inclusionPath','queryProblem','problemTransfer','problemReductionPath','frontierStatus','dominatedBy','dominanceEvidence','sotaQueryStatus','sotaScope','sotaAppliesToQuery','sotaSetting','sotaReason','sotaEvidenceUrl','sotaChecked'];
    fields.push('sourceResultId','parentResultId','sourceVerification','sourceProblem','sourceGraphClass','reductionPath','reductionDirection','reductionSteps','sourceMath');
    fields.push('parametersSource','assumptionsSource','variantSource','summarySource','notationChanges');
    fields.push('approximationBenchmark','constantApproximation','queryApproximationDisplay','queryConstantApproximation');
    fields.push('setting','querySetting','inputConditions','weightCondition');
    fields.push('roundClassSource','roundParameters','approximationParameters','parameterDefinitions','roundBudgetExcluded','roundCountEvidence','roundComplexityDetails');
    fields.push('queryRoundsDisplay','queryRoundClass','queryRoundComplexityDetails','roundSpecialization','graphParameterBindings','algorithmFamily','graphParameterRoles');
    fields.push('tightQueryStatus','tightAppliesToQuery','tightAxes','tightScope','tightCertificates');
    const escape = value => '"' + (typeof value==='object'&&value!==null?JSON.stringify(value):String(value ?? '')).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g,'""') + '"';
    return [fields.join(','),...rows.map(row => fields.map(key=>escape(row[key])).join(','))].join('\r\n');
  }
  function bibtex(paper) {
    const escape = value => String(value).replace(/[\\&%$#_{}~^]/g, c => ({'\\':'\\textbackslash{}','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c] || '\\'+c));
    const authors = escape(paper.authors.replace(/;\s*/g,' and '));
    const thesis=paper.type==='phdthesis';
    return '@'+(thesis?'phdthesis':'misc')+'{'+paper.id+',\n  title = {{'+escape(paper.title)+'}},\n  author = {'+authors+'},\n  year = {'+paper.year+'},\n  '+(thesis?'school = {'+escape(paper.school):'howpublished = {'+escape(paper.venue))+'},\n  url = {'+paper.url+'}'+(paper.doi?',\n  doi = {'+paper.doi+'}':'')+'\n}';
  }
  const api = {roundLabels,roundOrder,compareText,compareProblems,problemPublicationCount,normalize,searchMatches,graphNetwork,graphNodes,resolveClass,inclusionPath,graphScope,graphTags,problemNetwork,problemNodes,resolveProblem,problemPath,problemScope,problemMatch,reductions,filteredReductions,reductionApplications,searchContext,classMatch,graphMatch,matchedScopeTransfer,effectiveApproximation,effectiveRounds,sotaContext,sotaApplies,tightBounds,tightContext,tightApplies,matches,filtered,csv,bibtex};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtlasCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
