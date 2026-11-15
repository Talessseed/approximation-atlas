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
test('regimes put constant and log-star before slower bounds, independent of year',()=>{
  const rows=['other','degree','logstar','polylog','constant','logarithmic'].map((roundClass,i)=>({...upper,id:String(i),roundClass}));
  assert.deepEqual(core.filtered(rows,{},{}).map(r=>r.roundClass),core.roundOrder);
});
test('search matches author accents and requires all query terms',()=>{
  assert.equal(core.matches(upper,{q:'hanckowiak cover'},{authors:'Hańćkowiak'}),true);
  assert.equal(core.matches(upper,{q:'hanckowiak matching'},{authors:'Hańćkowiak'}),false);
});
test('filters do not infer a general bound for a special graph class',()=>{
  assert.equal(core.matches({...upper,graphClass:'Outerplanar graphs'},{graph:'Planar'}),true);
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
