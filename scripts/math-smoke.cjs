/* Exercise the actual vendored MathJax with local assets only, including file URLs. */
const {JSDOM, ResourceLoader, VirtualConsole} = require(process.env.ATLAS_JSDOM || 'jsdom');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '../dist');
const url = process.env.ATLAS_TEST_URL || 'https://example.github.io/atlas/';
const base = new URL('.',url).href;
const requests = [], errors = [];
class LocalAssets extends ResourceLoader {
  fetch(request) {
    requests.push(request);
    if (!request.startsWith(base)) {
      errors.push(new Error('Unexpected external resource: '+request));
      return null;
    }
    try {
      const path = request.startsWith('file:') ? new URL(request) : resolve(root, decodeURIComponent(new URL(request).pathname.slice(new URL(base).pathname.length)));
      return Promise.resolve(readFileSync(path));
    } catch (error) {errors.push(error);return null;}
  }
}
const virtualConsole = new VirtualConsole();
for (const event of ['jsdomError','warn','error']) virtualConsole.on(event, (...args) => errors.push(args.join(' ')));
const dom = new JSDOM(readFileSync(resolve(root, 'index.html'), 'utf8'), {
  url, resources: new LocalAssets(), runScripts:'dangerously', virtualConsole,
  beforeParse(w) {
    w.scrollTo=()=>{};
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  }
});
const w = dom.window, d = w.document;
function readableMathText(node){if(node.nodeType===3)return node.textContent;if(node.nodeType!==1)return '';if(node.hasAttribute('data-math-ready')&&node.hasAttribute('aria-label'))return node.getAttribute('aria-label');return [...node.childNodes].map(readableMathText).join('');}

const deadline = setTimeout(()=>{console.error('MathJax check timed out',errors);w.close();process.exitCode=1;},30000);
const ready = async root => {
  await w.AtlasMath.render(root);
  const formulas=[...root.querySelectorAll('[data-tex]')];
  assert.ok(formulas.length>0);
  assert.ok(formulas.every(e=>e.dataset.mathReady==='true' && e.querySelector('svg')),'every formula renders as SVG');
  assert.ok(formulas.every(e=>e.getAttribute('aria-label')),'every formula has an accessible label');
  assert.equal(root.querySelectorAll('[data-math-error], [data-mml-node="merror"]').length,0);
};
(async()=>{
  await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));
  assert.equal(w.MathJax.version,'4.1.3');
  await ready(d);
  assert.ok(d.querySelector('style[id*="SVG"]'),'MathJax SVG stylesheet is present');
  const sample=d.createElement('section');
  sample.innerHTML=Object.keys(w.ATLAS_DATA.notation).map(value=>w.AtlasMath.html(value)).join('');
  d.body.append(sample);
  await ready(sample);
  const total=sample.childElementCount;
  sample.remove();
  // Repeated filtering and modal replacement must not leave stale formulas.
  for(const round of ['logstar','constant','logstar']) d.querySelector('[data-round="'+round+'"]').click();
  await ready(d.querySelector('#results-body'));
  const marked=w.ATLAS_DATA.results.find(r=>r.sota && r.roundClass==='logstar');
  d.querySelector('[data-result="'+marked.id+'"]').click();
  await ready(d.querySelector('#detail-dialog'));
  assert.ok(readableMathText(d.querySelector('.sota-note')).includes(marked.sota.reason),'certificate explanations remain visible after typesetting');
  assert.equal(d.querySelector('.original-source-fields').open,false,'raw source wording remains in a collapsed appendix');
  assert.ok(readableMathText(d.querySelector('.original-source-fields')).includes(marked.sota.setting),'typesetting preserves the complete original SOTA setting');
  assert.equal(d.querySelectorAll('.setting-section [data-condition="weights-unweighted"]').length,1,'setting facts are rendered once beside the formulas');
  assert.equal(d.querySelectorAll('.detail-metrics [data-condition]').length,0,'formula metrics do not repeat setting facts');
  d.querySelector('#dialog-close').click();
  d.querySelector('[data-view="explorer"]').click();
  await ready(d.querySelector('#matrix'));
  const ids=[...d.querySelectorAll('[id]')].map(e=>e.id);
  assert.equal(new Set(ids).size,ids.length,'cached SVGs introduce no duplicate IDs');
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(r=>r.startsWith(base)),'no network dependencies');
  console.log('MathJax 4.1.3: '+total+' notations rendered; filtering, details, explorer, accessible labels and local-only resources passed at '+url);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(deadline);w.close();});
