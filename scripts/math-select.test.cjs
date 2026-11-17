/* Optional DOM component checks; the deployed website has no jsdom dependency. */
const {JSDOM}=require(process.env.ATLAS_JSDOM||'jsdom');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');

const dom=new JSDOM('<!doctype html><form id="filters"><label for="graph">Graph class</label><select id="graph"><option value="">All graph classes</option><option>Planar</option><option disabled>Disabled class</option><option>Euler genus ≤ g</option><option>Planar with an attached clique</option><option>H-minor-free; pw(H) ≤ 2</option></select><label for="class-focus">Focus class<select id="class-focus"><option>Planar</option><option>Euler genus ≤ g</option></select></label><button id="outside" type="button">Outside</button></form>',{runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document,requests=[];
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
w.AtlasMath={
  text(value,definitions,interactive){requests.push({value,interactive});return value.includes('≤')?'<span class="graph-math" data-tex="g">'+escape(value)+'</span>':escape(value);},
  async render(root){for(const element of root.querySelectorAll('[data-tex]')){element.dataset.mathReady='true';element.setAttribute('aria-label',element.textContent);element.innerHTML='<svg aria-hidden="true"></svg>';}}
};
w.eval(readFileSync(resolve(__dirname,'../dist/math-select.js'),'utf8'));
const select=d.querySelector('#graph'),focus=d.querySelector('#class-focus');
const picker=w.AtlasMathSelect.enhance(select),second=w.AtlasMathSelect.enhance(focus);
const key=(name,target=picker.button)=>target.dispatchEvent(new w.KeyboardEvent('keydown',{key:name,bubbles:true}));
const active=()=>d.getElementById(picker.button.getAttribute('aria-activedescendant'));
const flush=()=>Promise.resolve().then(()=>Promise.resolve());

(async()=>{
  assert.equal(select.hidden,true);
  assert.equal(select.getAttribute('aria-hidden'),'true');
  assert.equal(d.querySelector('label').htmlFor,picker.button.id);
  assert.equal(picker.popup.isConnected,false,'closed options add no initial MathJax work');
  assert.equal(picker.button.hasAttribute('aria-controls'),false,'a closed control has no dangling ID reference');
  assert.equal(picker.button.getAttribute('aria-label'),'Graph class: All graph classes');
  assert.equal(w.AtlasMathSelect.enhance(select),picker,'enhancement is idempotent');
  assert.ok(requests.every(request=>request.interactive===false),'control labels never contain interactive parameter targets');
  picker.focus();assert.equal(d.activeElement,picker.button);

  picker.button.click();await flush();
  assert.equal(picker.button.getAttribute('aria-expanded'),'true');
  assert.equal(picker.popup.parentElement,d.body,'the popup escapes sidebar clipping');
  assert.equal(picker.button.getAttribute('aria-controls'),picker.popup.id);
  assert.equal(picker.popup.querySelectorAll('[role="option"]').length,6);
  assert.ok(picker.popup.querySelector('[data-tex][data-math-ready] svg'),'option equations are typeset');
  assert.equal(active().dataset.optionLabel,'All graph classes');
  key('ArrowDown');assert.equal(active().dataset.optionLabel,'Planar');
  key('ArrowDown');assert.equal(active().dataset.optionLabel,'Euler genus ≤ g','disabled options are skipped');
  assert.equal(select.value,'','browsing does not change the catalog filter');
  key('Escape');assert.equal(select.value,'');assert.equal(picker.button.getAttribute('aria-expanded'),'false');
  assert.equal(picker.popup.isConnected,false);assert.equal(picker.button.hasAttribute('aria-activedescendant'),false);

  const events=[];select.addEventListener('input',()=>events.push('input'));select.addEventListener('change',()=>events.push('change'));
  picker.open();key('End');key('Enter');await flush();
  assert.equal(select.value,'H-minor-free; pw(H) ≤ 2');
  assert.deepEqual(events,['input','change'],'committing emits the native input/change sequence exactly once');
  assert.equal(picker.button.getAttribute('aria-label'),'Graph class: H-minor-free; pw(H) ≤ 2');
  assert.ok(picker.button.querySelector('[data-math-ready] svg'),'the selected value is typeset');

  picker.open();key('Home');key('Escape');assert.equal(select.value,'H-minor-free; pw(H) ≤ 2','Escape cancels Home/End browsing');
  key('e');key('u');key('l');key('e');key('r');assert.equal(active().dataset.optionLabel,'Euler genus ≤ g');key('Enter');
  assert.equal(select.value,'Euler genus ≤ g','typeahead commits the exact underlying label');
  picker.open();key('Home');d.querySelector('#outside').dispatchEvent(new w.Event('pointerdown',{bubbles:true}));
  assert.equal(select.value,'Euler genus ≤ g');assert.equal(picker.button.getAttribute('aria-expanded'),'false');

  picker.open();picker.popup.querySelector('[data-option-index="1"]').click();assert.equal(select.value,'Planar');
  assert.equal(d.activeElement,picker.button,'pointer selection restores the control focus');
  picker.open();second.open();assert.equal(picker.button.getAttribute('aria-expanded'),'false');assert.equal(second.button.getAttribute('aria-expanded'),'true');
  w.AtlasMathSelect.close();assert.equal(second.popup.isConnected,false);
  select.value='Euler genus ≤ g';w.AtlasMathSelect.sync(select);await flush();
  assert.equal(picker.button.getAttribute('aria-label'),'Graph class: Euler genus ≤ g','URL/programmatic state changes synchronize the visible control');
  select.value='Planar';select.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(picker.button.getAttribute('aria-label'),'Graph class: Planar');
  select.disabled=true;w.AtlasMathSelect.sync();assert.equal(picker.button.disabled,true);picker.open();assert.equal(picker.popup.isConnected,false);
  select.disabled=false;w.AtlasMathSelect.sync();w.AtlasMathSelect.focus(select);assert.equal(d.activeElement,picker.button);
  select.value='Euler genus ≤ g';w.AtlasMathSelect.sync(select);d.querySelector('form').reset();await flush();
  assert.equal(select.value,'');assert.equal(picker.button.getAttribute('aria-label'),'Graph class: All graph classes');
  for(const letter of 'planar')key(letter);
  assert.equal(active().dataset.optionLabel,'Planar','extending a typeahead prefix retains its current match instead of cycling to another shared prefix');key('Escape');
  picker.open();key('End');key('Tab');assert.equal(select.value,'H-minor-free; pw(H) ≤ 2');assert.equal(picker.popup.isConnected,false);
  const ids=[...d.querySelectorAll('[id]')].map(element=>element.id);assert.equal(new Set(ids).size,ids.length);
  console.log('Math select: MathJax labels, native values/events, keyboard/typeahead/cancellation, pointer selection, portal, focus, disabled state, programmatic sync and form reset passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>w.close());
