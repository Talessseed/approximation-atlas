const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const catalog=require('../dist/data/catalog.json');

function renderer(exact=true){
  const document={baseURI:'https://example.org/atlas/',documentElement:{},addEventListener(){}};
  const window={document,ATLAS_DATA:{...catalog,graphNotation:exact?catalog.graphNotation:{}},addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/math.js'),'utf8'),{
    window,document,URL,MutationObserver:class{observe(){}},setTimeout,clearTimeout,
  });
  return window.AtlasMath;
}

test('graph text exact metadata and compact fragment fallback render identically',()=>{
  const exact=renderer(),fallback=renderer(false);
  for(const label of Object.keys(catalog.graphNotation)){
    assert.equal(fallback.text(label),exact.text(label),label);
    assert.ok(exact.text(label).includes('data-tex='),label+' contains MathJax markup');
  }
});

test('graph text preserves prose, protects word boundaries and escapes HTML',()=>{
  const math=renderer(false);
  assert.equal(math.text('a graph has a fixed class'), 'a graph has a fixed class');
  assert.equal(math.text('Hence graphGroup cannot be split'), 'Hence graphGroup cannot be split');
  assert.equal(math.text('<img src=x> & a graph'), '&lt;img src=x&gt; &amp; a graph');
  assert.ok(math.text('A new class excludes K₂,t as a minor.').includes('data-tex="K_{2,t}"'));
});

test('graph labels retain parameter explanations without nested control tab stops',()=>{
  const math=renderer(),definitions=[{symbol:'g',description:'Euler genus bound'}];
  assert.ok(math.text('Euler genus ≤ g',definitions).includes('data-parameter-definitions='));
  assert.ok(!math.text('Euler genus ≤ g',definitions,false).includes('data-parameter-definitions='));
});
