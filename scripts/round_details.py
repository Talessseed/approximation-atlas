"""Keep compact catalog bounds separate from source-checked detailed runtimes."""
from copy import deepcopy
import re
from urllib.parse import urlparse


STATUSES = {'explicit', 'partial', 'not-stated', 'not-extracted', 'impossibility'}


def compile_round_details(results, papers, notation, registry):
    assert registry.get('version') == 1, 'Unsupported detailed-round registry version'
    assert isinstance(registry.get('checked'), str) and registry['checked'], 'Detailed-round audit needs a date'
    rows = {r['id']: r for r in results}
    entries = {}
    for entry in registry['entries']:
        entry = deepcopy(entry)
        rid = entry['resultId']
        assert rid in rows and rid not in entries, f'Unknown or duplicate detailed-round result: {rid}'
        assert entry['status'] in STATUSES, f'Unknown detailed-round status: {rid}'
        if rows[rid].get('roundBudgetExcluded'):
            assert entry['status'] == 'impossibility', f'A lower-bound round budget must remain an impossibility: {rid}'
        assert entry['basis'] and entry['explanation'], f'Missing detailed-round explanation: {rid}'
        assert entry['evidence'], f'Missing detailed-round evidence: {rid}'
        for evidence in entry['evidence']:
            assert all(isinstance(evidence.get(k), str) and evidence[k] for k in ('url', 'title', 'location')), rid
            assert urlparse(evidence['url']).scheme == 'https', rid
        if 'expression' in entry:
            assert 'formula' not in entry and 'tex' not in entry, f'Do not duplicate a structured runtime: {rid}'
            assert 'suffix' in entry, f'Missing runtime definitions or domain: {rid}'
            for part in ('expression', 'suffix'):
                assert set(entry[part]) == {'formula', 'tex'}, f'Invalid runtime {part}: {rid}'
                assert all(isinstance(value, str) and value for value in entry[part].values()), rid
            entry['formula'] = entry['expression']['formula'] + entry['suffix']['formula']
            entry['tex'] = entry['expression']['tex'] + entry['suffix']['tex']
        else:
            assert 'suffix' not in entry, f'A runtime suffix needs its expression: {rid}'
        if 'formula' in entry:
            assert isinstance(entry['formula'], str) and entry['formula'], rid
            assert isinstance(entry.get('tex'), str) and entry['tex'], rid
            assert r'\\' not in entry['tex'], f'Escaped line break in detailed runtime: {rid}'
        assert entry['status'] not in {'explicit', 'partial'} or 'formula' in entry, f'Missing explicit runtime: {rid}'
        assert 'displayInTable' not in entry or isinstance(entry['displayInTable'], bool), f'Invalid compact-display review: {rid}'
        if entry.get('displayInTable'):
            assert entry['status'] == 'explicit' and not rows[rid].get('roundBudgetExcluded'), f'Only a checked explicit runtime can refine the compact display: {rid}'
        for parameter in entry.get('parameters', []):
            assert set(parameter) <= {'symbol', 'description', 'tex'}, rid
            assert all(isinstance(parameter.get(k), str) and parameter[k] for k in ('symbol', 'description')), rid
        entries[rid] = entry

    for rid, row in rows.items():
        label = row['roundsDisplay']
        evidence = [{'url': row['sourceUrl'], 'title': papers[row['paperId']]['title'], 'location': row['theorem']}]
        detail = {
            'status':'explicit', 'formula':label, 'tex':notation[label],
            'basis':'recorded', 'explanation':'', 'evidence':evidence,
            'parameters':[], 'checked':registry['checked'], 'audited':False,
        }
        if row.get('roundBudgetExcluded') and row.get('roundParameters'):
            arguments = ', '.join(p['symbol'] for p in row['roundParameters'])
            tex_arguments = ','.join(notation[p['symbol']] for p in row['roundParameters'])
            detail.update(
                status='impossibility',
                formula='Any T('+arguments+') independent of n',
                tex=r'\text{Any }T\bigl('+tex_arguments+r'\bigr)\text{ independent of }n',
                basis='quantified-impossibility',
                explanation='This excludes every round complexity depending only on the listed fixed parameters, independently of n. It is a lower-bound budget, not the running time of an algorithm.',
                parameters=[{'symbol':'T', 'description':'An arbitrary number of communication rounds depending only on the listed fixed parameters', 'tex':'T'}],
            )
        elif row.get('roundParameters'):
            detail.update(status='not-extracted', basis='symbolic',
                          explanation='A more explicit dependence on these parameters has not yet been extracted for this record. The displayed function records the dependence without assigning a numerical growth rate.')
        elif re.search(r'polylog|\bpoly\(', label):
            detail.update(status='not-extracted', basis='symbolic',
                          explanation='A numerical polynomial exponent has not yet been extracted for this record. The displayed expression retains all currently recorded parameter dependence.')
        elif row.get('roundCountEvidence'):
            count = row['roundCountEvidence']
            if count.get('rounds'):
                detail.update(basis=count['basis'], explanation=count['explanation'], evidence=deepcopy(count['evidence']))
            else:
                detail.update(status='not-stated', basis=count['basis'], explanation=count['explanation'], evidence=deepcopy(count['evidence']))
        if rid in entries:
            entry = entries[rid]
            detail.update({key:deepcopy(value) for key,value in entry.items() if key != 'resultId'})
            detail['audited'] = True
        if detail['formula'] in notation and notation[detail['formula']] != detail['tex']:
            detail['formula'] += ' [source detail]'
        notation[detail['formula']] = detail['tex']
        row['roundComplexityDetails'] = detail
        if detail.get('displayInTable'):
            row['roundsDisplay'] = detail['formula']
            row.pop('roundParameters', None)
    return len(entries)
