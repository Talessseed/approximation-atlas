(function (root) {
  'use strict';
  const roundLabels = {constant:'Constant rounds',logstar:'Iterated logarithmic rounds',degree:'Degree / parameter dependent',logarithmic:'Logarithmic rounds',polylog:'Polylogarithmic rounds',other:'Other round bounds'};
  const roundOrder = Object.keys(roundLabels);
  const normalize = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function graphTags(value) {
    const s = normalize(value), tags = new Set();
    if (/outerplanar/.test(s)) tags.add('Outerplanar');
    if (/planar/.test(s)) tags.add('Planar');
    if (/genus/.test(s)) tags.add('Bounded genus');
    if (/minor/.test(s)) tags.add('Minor-free');
    if (/expansion/.test(s)) tags.add('Bounded expansion');
    if (/arboricity/.test(s)) tags.add('Bounded arboricity');
    if (/degree|regular/.test(s)) tags.add('Bounded degree');
    if (/unit.disk/.test(s)) tags.add('Unit-disk');
    if (/growth|independence/.test(s)) tags.add('Bounded growth / independence');
    if (/bipartite|bicolou?red|2.colou?red/.test(s)) tags.add('Bipartite / colored');
    if (/tree|forest/.test(s)) tags.add('Trees / forests');
    if (/general|arbitrary/.test(s)) tags.add('General graphs');
    if (!tags.size) tags.add('Other classes');
    return [...tags];
  }
  function matches(result, state, paper) {
    if (state.paper && result.paperId !== state.paper) return false;
    if (state.problem && result.problem !== state.problem) return false;
    if (state.graph && !graphTags(result.graphClass).includes(state.graph)) return false;
    if (state.bound && result.bound !== state.bound) return false;
    if (state.randomization && result.randomization !== state.randomization) return false;
    if (state.verification && result.verification !== state.verification) return false;
    if (state.round && result.roundClass !== state.round) return false;
    if (state.model && result.model !== state.model) {
      if (!state.transfer) return false;
      const compatible = result.bound === 'upper'
        ? state.model === 'LOCAL' && ['CONGEST','Anonymous'].includes(result.model)
        : state.model === 'CONGEST' && result.model === 'LOCAL';
      if (!compatible) return false;
    }
    const text = normalize([result.problem,result.variant,result.graphClass,result.model,result.approximation,result.rounds,result.parameters,result.assumptions,result.summary,paper?.title,paper?.authors,result.year].join(' '));
    return normalize(state.q).split(/\s+/).filter(Boolean).every(term => text.includes(term));
  }
  function filtered(results, papers, state) {
    const list = results.filter(r => matches(r,state,papers[r.paperId]));
    return list.sort((a,b) => {
      if (state.sort === 'newest') return b.year-a.year || a.id.localeCompare(b.id);
      if (state.sort === 'oldest') return a.year-b.year || a.id.localeCompare(b.id);
      if (state.sort === 'problem') return a.problem.localeCompare(b.problem) || roundOrder.indexOf(a.roundClass)-roundOrder.indexOf(b.roundClass) || b.year-a.year;
      return roundOrder.indexOf(a.roundClass)-roundOrder.indexOf(b.roundClass) || a.problem.localeCompare(b.problem) || b.year-a.year;
    });
  }
  function csv(rows) {
    const fields = ['id','problem','variant','bound','approximation','rounds','roundClass','graphClass','model','randomization','parameters','assumptions','year','paperId','paperTitle','authors','venue','theorem','verification','status','caveat','caveatUrl','sourceUrl'];
    const escape = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g,'""') + '"';
    return [fields.join(','),...rows.map(row => fields.map(key=>escape(row[key])).join(','))].join('\r\n');
  }
  const api = {roundLabels,roundOrder,normalize,graphTags,matches,filtered,csv};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtlasCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
