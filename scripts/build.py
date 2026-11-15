"""Validate the hand-curated data and generate an offline-capable browser bundle."""
import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
required = {'id','problem','variant','objective','graphClass','model','randomization','bound','approximation','rounds','roundClass','parameters','assumptions','paperId','theorem','summary','verification','sourceUrl','year'}
enums = {
    'objective': {'min','max'},
    'model': {'LOCAL','CONGEST','SUPPORTED','Anonymous'},
    'randomization': {'Deterministic','Randomized','Unspecified'},
    'bound': {'upper','lower'},
    'roundClass': {'constant','logstar','degree','logarithmic','polylog','other'},
    'verification': {'primary','survey'},
}

def build():
    papers, results = [], []
    paths = [ROOT/'dist/data/sparse.json', ROOT/'dist/data/general.json']
    if (ROOT/'dist/data/picavet.json').exists():
        paths.append(ROOT/'dist/data/picavet.json')
    for path in paths:
        source = json.loads(path.read_text())
        papers.extend(source['papers'])
        results.extend(source['results'])
    assert len({p['id'] for p in papers}) == len(papers), 'Duplicate paper id'
    assert len({r['id'] for r in results}) == len(results), 'Duplicate result id'
    paper_ids = {p['id'] for p in papers}
    for p in papers:
        assert {'id','title','authors','year','venue','url'} <= p.keys(), p
        assert urlparse(p['url']).scheme == 'https', p['id']
        assert isinstance(p['authors'], str), p['id']
    for r in results:
        assert required <= r.keys(), f"{r.get('id')}: missing {required - r.keys()}"
        assert r['paperId'] in paper_ids, r['id']
        assert isinstance(r['year'], int) and 1950 <= r['year'] <= 2026, r['id']
        for key, allowed in enums.items():
            assert r[key] in allowed, f"{r['id']}: invalid {key}: {r[key]}"
        assert urlparse(r['sourceUrl']).scheme == 'https', r['id']
        for key in required - {'year'}:
            assert isinstance(r[key], str), f"{r['id']}: {key} must be text"
    catalog = {'updated':'2026-11-15','papers':papers,'results':results}
    bundle = json.dumps(catalog, ensure_ascii=False, indent=2)
    (ROOT/'dist/data/catalog.json').write_text(bundle+'\n')
    (ROOT/'dist/data/catalog.js').write_text('window.ATLAS_DATA = '+bundle.replace('<','\\u003c')+';\n')
    print(f'Validated {len(results)} results across {len(papers)} papers; wrote catalog.json and catalog.js.')

if __name__ == '__main__':
    build()
