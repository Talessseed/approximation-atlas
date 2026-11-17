"""Compile result-specific meanings for mathematical parameters.

Source descriptions take precedence over conventional symbols: d, a, f and
other letters must never acquire a meaning merely from a global dictionary.
Named-bound metadata also supplies definitions for newly added source rows.
"""
from copy import deepcopy
import re


_TEX = {
    'Δ': r'\Delta', 'Γ': r'\Gamma', 'ε': r'\varepsilon', 'δ': r'\delta',
    'ρ': r'\rho', 'α': r'\alpha', 'β': r'\beta', 'γ': r'\gamma',
    'η': r'\eta', 'θ': r'\theta', 'λ': r'\lambda', 'μ': r'\mu',
    'ν': r'\nu', 'π': r'\pi', 'σ': r'\sigma', 'τ': r'\tau',
    'φ': r'\varphi', 'ϕ': r'\phi', 'ω': r'\omega', 'Φ': r'\Phi',
    '∇₁': r'\nabla_1', '𝒞': r'\mathcal{C}', '𝗀': 'g',
    'Δ_L': r'\Delta_L', 'm_L': 'm_L',
}
_SUBSCRIPTS = str.maketrans('₀₁₂₃₄₅₆₇₈₉ₖₜₚ', '0123456789ktp')


def symbol_tex(symbol, notation=None):
    if notation and symbol in notation:
        return notation[symbol]
    if symbol in _TEX:
        return _TEX[symbol]
    tex = symbol
    for plain, replacement in _TEX.items():
        if len(plain) == 1:
            tex = tex.replace(plain, replacement)
    tex = re.sub(r'[₀₁₂₃₄₅₆₇₈₉ₖₜₚ]+', lambda m: '_{' + m.group().translate(_SUBSCRIPTS) + '}', tex)
    return tex


def validate_registry(registry, source_ids):
    assert registry.get('version') == 1, 'Unsupported parameter registry version'
    entries = registry.get('results')
    assert isinstance(entries, dict), 'Parameter definitions must be indexed by result'
    assert set(entries) <= set(source_ids), f'Unknown parameter result IDs: {sorted(set(entries) - set(source_ids))}'
    for rid, definitions in entries.items():
        assert isinstance(definitions, list), f'Parameter definitions must be a list: {rid}'
        seen, aliases = set(), set()
        for definition in definitions:
            assert isinstance(definition, dict) and set(definition) <= {'symbol', 'description', 'tex', 'sourceSymbol'}, f'Unknown parameter definition field: {rid}'
            for key in ('symbol', 'description'):
                assert isinstance(definition.get(key), str) and definition[key].strip(), f'Missing parameter {key}: {rid}'
            assert definition['symbol'] not in seen, f'Duplicate parameter symbol: {rid} {definition["symbol"]}'
            seen.add(definition['symbol'])
            if 'tex' in definition:
                assert isinstance(definition['tex'], str) and definition['tex'].strip(), f'Empty parameter TeX: {rid}'
                assert r'\\' not in definition['tex'], f'Parameter TeX contains an escaped line break: {rid} {definition["symbol"]}'
            if 'sourceSymbol' in definition:
                assert isinstance(definition['sourceSymbol'], str) and definition['sourceSymbol'].strip(), f'Empty source parameter alias: {rid}'
                assert definition['sourceSymbol'] not in aliases, f'Duplicate source parameter alias: {rid}'
                aliases.add(definition['sourceSymbol'])
    return entries


def named_parameters(names, definitions):
    """Resolve explicit source aliases without changing any source expression."""
    aliases = {d['sourceSymbol']: d['symbol'] for d in definitions if 'sourceSymbol' in d}
    return [p | {'symbol': aliases.get(p['symbol'], p['symbol'])} for p in names]


def compile_parameters(catalog, registry):
    sources = {r['id']: r for r in catalog['sourceResults']}
    entries = validate_registry(registry, sources)
    notation = catalog['notation']
    recipes = catalog.get('reductions', {}).get('entries', [])
    recipe_parameters = {}
    for recipe in recipes:
        supplied = deepcopy(recipe.get('parameterDefinitions', []))
        validate_registry({'version':1, 'results':{recipe['id']:supplied}}, {recipe['id']})
        recipe_parameters[recipe['id']] = supplied
    instances = {}
    for row in [*catalog['sourceResults'], *catalog['results']]:
        instances.setdefault(row['id'], []).append(row)
    result_map = {rid: rows[0] for rid, rows in instances.items()}
    for rid, rows in instances.items():
        row = rows[0]
        source_id = row.get('sourceResultId', rid)
        definitions = {}

        def add(symbol, description, tex=None, replace=False, source_symbol=None):
            if symbol == 'class':
                return
            alias = source_symbol or definitions.get(symbol, {}).get('sourceSymbol')
            if symbol not in definitions or replace:
                definitions[symbol] = {'symbol': symbol, 'description': description, 'tex': tex or symbol_tex(symbol, notation)}
            if alias:
                definitions[symbol].setdefault('sourceSymbol', alias)

        for definition in entries.get(source_id, []):
            add(definition['symbol'], definition['description'], definition.get('tex'), source_symbol=definition.get('sourceSymbol'))
        for definition in row.get('roundComplexityDetails', {}).get('parameters', []):
            add(definition['symbol'], definition['description'], definition.get('tex'), replace=True)
        source = sources.get(source_id, row)
        changes = {change['sourceSymbol']: change['symbol'] for change in source.get('notationChanges', [])}
        for old, new in changes.items():
            if old in definitions and new not in definitions:
                definition = definitions.pop(old)
                add(new, definition['description'], source_symbol=definition.get('sourceSymbol'))
        for step in reversed(row.get('reductionSteps', [])):
            for definition in recipe_parameters.get(step['id'], []):
                add(definition['symbol'], definition['description'], definition.get('tex'), source_symbol=definition.get('sourceSymbol'))
        for field in ('roundParameters', 'approximationParameters'):
            for parameter in row.get(field, []):
                name = parameter['name']
                add(parameter['symbol'], name[:1].upper() + name[1:])
        if row.get('problemParameter'):
            name = row.get('problemParameterName', 'Problem parameter')
            add(row['problemParameter'], name[:1].upper() + name[1:])

        visible = ' '.join(str(row.get(field, '')) for field in (
            'problem', 'graphClass', 'variant', 'approximationDisplay', 'roundsDisplay',
            'parameters', 'assumptions',
        ))
        visible += ' ' + row.get('roundComplexityDetails', {}).get('formula', '')
        for symbol, description in (
            ('n', 'Number of vertices in the communication network'),
            ('Δ', 'Maximum degree'),
            ('ε', 'Approximation accuracy'),
        ):
            if re.search(r'(?<![A-Za-z])' + re.escape(symbol) + r'(?![A-Za-z])', visible):
                add(symbol, description)
        if row.get('verification') == 'derived':
            # These variables refer to the target communication graph, not to
            # the source's incidence or virtual graph after a size substitution.
            for symbol, description in (
                ('n', 'Number of vertices in the original communication graph'),
                ('m', 'Number of edges in the original communication graph'),
                ('Δ', 'Maximum degree of the original communication graph'),
            ):
                add(symbol, description, replace=True)
            if any(step['id'] == 'edge-domination-to-domination' for step in row['reductionSteps']):
                add('Δ_L', 'Maximum degree of the line graph L(G)', replace=True)
                add('m_L', 'Number of edges of the line graph L(G)', replace=True)
        for field in ('roundsDisplay', 'approximationDisplay'):
            value = row.get(field, '')
            if value.startswith(('f(', 'F(')) and row.get('roundParameters' if field == 'roundsDisplay' else 'approximationParameters'):
                add(value[0], 'Unspecified function of the displayed parameters')
        for definition in definitions.values():
            notation.setdefault(definition['symbol'], definition['tex'])
        ordered = sorted(definitions.values(), key=lambda d: (-len(d['symbol']), d['symbol']))
        for instance in rows:
            instance['parameterDefinitions'] = deepcopy(ordered)
    recipe_definitions = [
        {'symbol':'T', 'description':'Round complexity of the algorithm on the transformed instance', 'tex':'T'},
        {'symbol':'α', 'description':'Approximation ratio of the algorithm used by the reduction', 'tex':r'\alpha'},
        {'symbol':'n', 'description':'Number of vertices in the original communication graph', 'tex':'n'},
        {'symbol':'m', 'description':'Number of edges in the original communication graph', 'tex':'m'},
        {'symbol':'Δ', 'description':'Maximum degree of the original communication graph', 'tex':r'\Delta'},
        {'symbol':'n′', 'description':'Number of vertices in the transformed instance', 'tex':"n'"},
        {'symbol':'Δ′', 'description':'Maximum degree of the transformed instance', 'tex':r"\Delta'"},
        {'symbol':'G', 'description':'Original communication graph', 'tex':'G'},
    ]
    for recipe in recipes:
        recipe['parameterDefinitions'] = deepcopy(recipe_definitions)
        if recipe['id'] == 'edge-domination-to-domination':
            recipe['parameterDefinitions'] += [
                {'symbol':'Δ_L', 'description':'Maximum degree of the line graph L(G)', 'tex':r'\Delta_L'},
                {'symbol':'m_L', 'description':'Number of edges of the line graph L(G)', 'tex':'m_L'},
            ]
        merged = {definition['symbol']: definition for definition in recipe['parameterDefinitions']}
        for definition in recipe_parameters[recipe['id']]:
            supplied = deepcopy(definition)
            supplied.setdefault('tex', symbol_tex(supplied['symbol'], notation))
            merged[supplied['symbol']] = supplied
            notation.setdefault(supplied['symbol'], supplied['tex'])
        recipe['parameterDefinitions'] = list(merged.values())
    return sum(len(row['parameterDefinitions']) for row in result_map.values())
