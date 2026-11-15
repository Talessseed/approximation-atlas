"""Check static document integrity without a browser or third-party packages."""
from html.parser import HTMLParser
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.refs, self.assets, self.stack = set(), [], [], []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id'):
            assert a['id'] not in self.ids, f"Duplicate id: {a['id']}"
            self.ids.add(a['id'])
        if a.get('for'):
            self.refs.append(a['for'])
        if a.get('aria-labelledby'):
            self.refs.extend(a['aria-labelledby'].split())
        if tag == 'script' and a.get('src'):
            self.assets.append(a['src'])
        if tag == 'link' and a.get('href'):
            self.assets.append(a['href'])
        if tag not in VOID:
            self.stack.append(tag)
    def handle_endtag(self, tag):
        assert self.stack and self.stack[-1] == tag, f'Unbalanced closing tag: {tag}; current stack: {self.stack}'
        self.stack.pop()

doc = Document()
doc.feed((DIST/'index.html').read_text())
assert not doc.stack, f'Unclosed tags: {doc.stack}'
for ref in doc.refs:
    assert ref in doc.ids or ref == 'dialog-title', f'Missing accessibility reference: {ref}'
for asset in doc.assets:
    assert not asset.startswith(('http:','https:')), f'Unexpected external runtime dependency: {asset}'
    assert (DIST/asset).is_file(), f'Missing runtime asset: {asset}'
app = (DIST/'app.js').read_text()
for selector in re.findall(r"\$\('#([a-z][\w-]*)'\)", app):
    assert selector in doc.ids, f'App refers to missing id: {selector}'
for name in ('catalog','explorer','bibliography','about'):
    assert name+'-view' in doc.ids
print(f'HTML integrity passed: {len(doc.ids)} unique IDs, {len(doc.assets)} local assets, all static app selectors resolved.')
