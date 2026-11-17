"""Compile reviewed setting/claim facts without parsing theorem prose.

The JSON registry classifies exact source variant values and supplies explicit
condition references. Unreviewed source paragraphs are interned intact. Source
fields and certificate evidence are never rewritten by this presentation pass.
"""

from copy import deepcopy
from hashlib import sha256


_KINDS = {
    'graph', 'weights', 'input', 'parameter', 'assumption', 'model',
    'output', 'detail', 'strength', 'scope', 'guarantee', 'claim',
}
_SETTING_FIELDS = ('summary', 'parameters', 'assumptions', 'detail', 'covered')


def _unique(values):
    return list(dict.fromkeys(values))


def _index(entries, key, label):
    result = {}
    for entry in entries:
        value = entry[key]
        assert value not in result, f'Duplicate {label}: {value}'
        result[value] = entry
    return result


def compile_conditions(catalog, registry):
    """Mutate a compiled catalog with normalized, ID-based presentation facts.

    ``catalog.conditions`` maps stable IDs to ``{kind, label, implies?}``.
    Every result receives ``setting`` with ID arrays ``summary``, ``parameters``,
    ``assumptions``, ``detail`` and the transitive ``covered`` closure. Only
    summary is intended for a compact row. The other arrays belong in details.
    An annotation's ``conditionIds`` lists reviewed claim restrictions; clients
    show only IDs outside setting.covered. Transfers also expose
    ``settingConditionIds`` (actual parameter bindings) and
    ``claimConditionIds`` (the same claim refs as conditionIds).

    Source fields, scope labels, graph/problem/model applicability and frontier
    decisions are preserved. This function does not establish applicability.
    Its return value contains counts useful for build output and audits.
    """
    assert registry.get('version') == 1, 'Unsupported conditions registry version'
    facts = deepcopy(registry['facts'])
    assert isinstance(facts, dict), 'Condition facts must be an ID map'
    for fid, fact in facts.items():
        assert isinstance(fid, str) and fid, 'Empty condition ID'
        assert fact.get('kind') in _KINDS, f'Unknown condition kind: {fid}'
        assert isinstance(fact.get('label'), str) and fact['label'].strip(), f'Empty condition label: {fid}'
        if 'parts' in fact:
            parts = fact['parts']
            assert isinstance(parts, list) and parts, f'Empty condition parts: {fid}'
            assert all(isinstance(part, str) or (
                isinstance(part, dict) and set(part) == {'math'} and
                isinstance(part['math'], str) and part['math'] in catalog['notation']
            ) for part in parts), f'Invalid condition parts or missing math notation: {fid}'
            assert ''.join(part if isinstance(part, str) else part['math'] for part in parts) == fact['label'], f'Condition parts differ from label: {fid}'

    def refs(values, context):
        assert isinstance(values, list), f'Condition references must be an array: {context}'
        assert len(values) == len(set(values)), f'Duplicate condition reference: {context}'
        assert all(isinstance(fid, str) and fid in facts for fid in values), f'Unknown condition reference: {context}'
        return values

    for fid, fact in facts.items():
        refs(fact.get('implies', []), fid)

    closures = {}

    def closure(fid, path=()):
        assert fid not in path, f'Condition implication cycle: {" -> ".join((*path, fid))}'
        if fid not in closures:
            result = {fid}
            for implied in facts[fid].get('implies', []):
                result.update(closure(implied, (*path, fid)))
            closures[fid] = result
        return closures[fid]

    for fid in facts:
        closure(fid)

    # Exact values may be shared; no token, substring or sentence matching is
    # used. The kind is included so a graph label cannot become an input fact.
    exact = {}
    for fid, fact in facts.items():
        key = (fact['kind'], fact['label'])
        assert key not in exact, f'Duplicate condition fact value: {fid}, {exact.get(key)}'
        exact[key] = fid

    def intern(kind, value):
        assert isinstance(value, str), f'Expected source string for {kind}'
        if not value.strip():
            return []
        key = (kind, value)
        if key not in exact:
            fid = 'auto-' + kind + '-' + sha256((kind + '\0' + value).encode('utf-8')).hexdigest()[:20]
            assert fid not in facts, f'Interned condition ID collision: {fid}'
            facts[fid] = {'kind': kind, 'label': value}
            exact[key] = fid
            closures[fid] = {fid}
        return [exact[key]]

    variants = _index(registry['variants'], 'value', 'variant profile')
    for value, variant in variants.items():
        refs([variant['weights']], f'Variant {value!r} weights')
        assert facts[variant['weights']]['kind'] == 'weights', f'Variant has no weight classification: {value!r}'
        for field in ('summary', 'detail', 'covered'):
            refs(variant.get(field, []), f'Variant {value!r} {field}')

    instances = {}
    for row in [*catalog['results'], *catalog.get('sourceResults', [])]:
        group = instances.setdefault(row['id'], [])
        if all(row is not other for other in group):
            group.append(row)
    results = {rid: group[0] for rid, group in instances.items()}
    profiles = _index(registry.get('profiles', []), 'resultId', 'result condition profile')
    assert set(profiles) <= set(results), f'Unknown result condition profiles: {sorted(set(profiles) - set(results))}'
    for rid, profile in profiles.items():
        assert set(profile) <= {'resultId', 'graph', 'weights', 'summary', 'parameters', 'assumptions', 'detail', 'covered', 'prerequisites'}, f'Unknown result condition profile field: {rid}'
        for field in (*_SETTING_FIELDS, 'prerequisites'):
            if field in profile:
                refs(profile[field], f'{rid} {field}')
        for field, kind in (('graph', 'graph'), ('weights', 'weights')):
            if field in profile:
                refs([profile[field]], f'{rid} {field}')
                assert facts[profile[field]]['kind'] == kind, f'Wrong {field} condition kind: {rid}'

    recipes = {entry['id']: entry for entry in catalog.get('reductions', {}).get('entries', [])}

    def variant_for(row):
        if row.get('verification') != 'derived':
            if row['variant'] in variants:
                return variants[row['variant']]
            # New ordinary records retain their whole variant rather than
            # acquiring an inferred weight/output classification from prose.
            assert 'weights-unspecified' in facts, 'Missing unspecified-weight fallback'
            return {'weights': 'weights-unspecified', 'detail': intern('detail', row['variant'])}
        # Read the target recipe, not the generated "Source algorithm" prose.
        # Later transformations may explicitly specialize the target to unit
        # weights; otherwise preserve the source's reviewed weight support.
        steps = row.get('reductionSteps', [])
        assert steps, f'Derived row has no reduction steps: {row["id"]}'
        for step in steps:
            assert step['id'] in recipes, f'Unknown reduction recipe: {step["id"]}'
            if step.get('direction') == 'lower':
                continue
            target = recipes[step['id']]['engine']['targetVariant']
            assert target in {'Unweighted', 'preserve'}, f'Unknown target variant: {step["id"]}'
            if target == 'Unweighted':
                return variants['Unweighted']
        source = results.get(row.get('sourceResultId'))
        assert source, f'Unknown derived source result: {row["id"]}'
        base = variant_for(source)
        # Source output/construction labels do not become target settings.
        source_profile = profiles.get(source['id'], {})
        return {'weights': source_profile.get('weights', base['weights'])}

    def covered(ids):
        result = set()
        for fid in ids:
            result.update(closure(fid))
        return result

    def minimal(ids, previous=()):
        ids = _unique(ids)
        previous_coverage = covered(previous)
        return [fid for fid in ids if fid not in previous_coverage and not any(
            fid != other and fid in closure(other) for other in ids
        )]

    for rid, row in results.items():
        profile = profiles.get(rid, {})
        variant = variant_for(row)
        graph = [profile['graph']] if 'graph' in profile else intern('graph', row['graphClass'])
        weights = [profile.get('weights', variant['weights'])]
        prerequisites = profile.get('prerequisites')
        if prerequisites is None:
            prerequisites = intern('input', row.get('prerequisite', ''))
        input_conditions = refs(row.get('inputConditions', []), f'{rid} input conditions')
        assert all(facts[fid]['kind'] == 'input' for fid in input_conditions), f'Wrong input condition kind: {rid}'
        summary = [*graph, *weights, *variant.get('summary', []), *prerequisites, *input_conditions, *profile.get('summary', [])]
        parameters = profile.get('parameters')
        if parameters is None:
            parameters = intern('parameter', row.get('parameters', ''))
        else:
            parameters = list(parameters)
        if 'parameterDefinitions' not in row:
            # Older imported records keep their readable glossary. Current
            # records expose these meanings through contextual hover/focus
            # definitions instead of repeating them in the setting.
            for parameter in row.get('roundParameters', []):
                assert all(isinstance(parameter.get(key), str) and parameter[key] for key in ('symbol', 'name')), f'Invalid round parameter definition: {rid}'
                parameters += intern('parameter', parameter['symbol'] + ' — ' + parameter['name'])
        assumptions = profile.get('assumptions')
        if assumptions is None:
            assumptions = intern('assumption', row.get('assumptions', ''))
        detail = [*variant.get('detail', []), *profile.get('detail', [])]
        if row.get('verification') == 'derived':
            detail += intern('detail', 'Source variant: ' + row['sourceVariant'])
            # Keep the complete, instantiated reduction conditions in the
            # original assumptions fact. Do not copy base construction labels
            # or base parameter domains onto transformed instance symbols.
        setting = {}
        for field, values in (('summary', summary), ('parameters', parameters), ('assumptions', assumptions), ('detail', detail)):
            previous = [fid for prior in setting.values() for fid in prior]
            setting[field] = minimal(values, previous)
        benchmark = row.get('approximationBenchmark')
        benchmark_ids = {'fractional': 'detail-fractional-benchmark', 'integral': 'detail-integral-benchmark'}
        benchmark_coverage = [benchmark_ids[benchmark]] if benchmark in benchmark_ids else []
        setting['covered'] = sorted(covered([
            *summary, *parameters, *assumptions, *detail,
            *variant.get('covered', []), *profile.get('covered', []),
            *intern('output', row['problem']),
            *intern('model', row['model']),
            *intern('model', row['randomization']),
            *benchmark_coverage,
        ]))
        for instance in instances[rid]:
            instance['setting'] = deepcopy(setting)

    sota = _index(registry.get('sota', []), 'resultId', 'SOTA condition profile')
    annotated = {rid for rid, row in results.items() if row.get('sota')}
    assert set(sota) == annotated, f'SOTA condition profiles differ from annotations: {sorted(set(sota) ^ annotated)}'
    for rid, entry in sota.items():
        assert set(entry) == {'resultId', 'conditionIds'}, f'Unknown SOTA condition profile field: {rid}'
        ids = refs(entry['conditionIds'], f'SOTA {rid}')
        for instance in instances[rid]:
            instance['sota']['conditionIds'] = list(ids)

    def transfer_key(entry):
        return entry.get('sourceResultId', entry.get('resultId')), entry.get('graph'), entry.get('problem')

    transfers = {}
    for entry in registry.get('transfers', []):
        key = transfer_key(entry)
        assert key not in transfers, f'Duplicate transfer condition profile: {key}'
        assert key[0] in results, f'Unknown transfer result: {key}'
        assert set(entry) <= {'resultId', 'graph', 'problem', 'conditionIds', 'settingConditionIds'}, f'Unknown transfer condition profile field: {key}'
        refs(entry['conditionIds'], f'Transfer {key} claims')
        refs(entry.get('settingConditionIds', []), f'Transfer {key} setting')
        transfers[key] = entry
    frontier_transfers = catalog.get('sotaFrontier', {}).get('scopeTransfers', [])
    expected_transfers = [transfer_key(entry) for entry in frontier_transfers]
    assert len(expected_transfers) == len(set(expected_transfers)), 'Duplicate source scope transfer'
    assert set(transfers) == set(expected_transfers), f'Transfer condition profiles differ from certificates: {set(transfers) ^ set(expected_transfers)}'
    transfer_instances = list(frontier_transfers)
    for group in instances.values():
        for row in group:
            transfer_instances += row.get('sotaScopeTransfers', [])
            transfer_instances += row.get('sotaProjections', [])
    for transfer in transfer_instances:
        key = transfer_key(transfer)
        assert key in transfers, f'Unknown compiled transfer: {key}'
        entry = transfers[key]
        transfer['conditionIds'] = list(entry['conditionIds'])
        transfer['claimConditionIds'] = list(entry['conditionIds'])
        transfer['settingConditionIds'] = list(entry.get('settingConditionIds', []))

    tight = _index(registry.get('tight', []), 'certificateId', 'tightness condition profile')
    certificates = _index(catalog.get('tightBounds', {}).get('certificates', []), 'id', 'tightness certificate')
    assert set(tight) == set(certificates), f'Tightness condition profiles differ from certificates: {sorted(set(tight) ^ set(certificates))}'
    applications = {}
    for cid, entry in tight.items():
        assert set(entry) == {'certificateId', 'applications'}, f'Unknown tightness condition profile field: {cid}'
        profiles_for_certificate = _index(entry['applications'], 'resultId', f'{cid} application condition profile')
        certificate_apps = _index(certificates[cid]['applications'], 'resultId', f'{cid} source application')
        assert set(profiles_for_certificate) == set(certificate_apps), f'Tightness applications differ: {cid}'
        for rid, app_profile in profiles_for_certificate.items():
            assert rid in results, f'Unknown tightness application result: {cid}, {rid}'
            assert set(app_profile) == {'resultId', 'conditionIds'}, f'Unknown tightness application condition field: {cid}, {rid}'
            ids = refs(app_profile['conditionIds'], f'Tightness {cid}, {rid}')
            certificate_apps[rid]['conditionIds'] = list(ids)
            applications[cid, rid] = ids
    compiled_apps = set()
    for rid, group in instances.items():
        for row in group:
            for application in row.get('tightness', []):
                key = application['certificateId'], rid
                assert key in applications, f'Unknown compiled tightness application: {key}'
                application['conditionIds'] = list(applications[key])
                compiled_apps.add(key)
    assert compiled_apps == set(applications), 'Missing compiled tightness application'

    # All generated and reviewed references are now resolvable in one map.
    catalog['conditions'] = facts
    return {
        'facts': len(facts),
        'reviewedFacts': len(registry['facts']),
        'internedFacts': len(facts) - len(registry['facts']),
        'variantProfiles': len(variants),
        'resultProfiles': len(profiles),
        'results': len(results),
        'sotaAnnotations': len(sota),
        'scopeTransfers': len(transfers),
        'tightCertificates': len(tight),
        'tightApplications': len(applications),
    }
