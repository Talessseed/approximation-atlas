"""Validate the hand-curated data and generate an offline-capable browser bundle."""
import json
import re
import unicodedata
from fractions import Fraction
from pathlib import Path
from urllib.parse import urlparse
from derive import derive_results, substitute_tex
from conditions import compile_conditions
from parameters import compile_parameters, named_parameters, symbol_tex, validate_registry
from round_details import compile_round_details

ROOT = Path(__file__).resolve().parents[1]
required = {'id','problem','variant','objective','graphClass','model','randomization','bound','approximation','rounds','roundClass','parameters','assumptions','paperId','theorem','summary','verification','sourceUrl','year'}
enums = {
    'objective': {'min','max'},
    'model': {'LOCAL','CONGEST','SUPPORTED','Anonymous'},
    'randomization': {'Deterministic','Randomized','Unspecified'},
    'bound': {'upper','lower'},
    'roundClass': {'constant','parameter','logstar','degree','logarithmic','polylog','other'},
    'verification': {'primary','survey'},
}

def symbol_is_introduced(symbol, text):
    # These fields precede the Rounds column; prose words must not introduce a variable.
    if symbol == 'class':
        return False
    if re.fullmatch('[A-Za-z]', symbol):
        aliases = {'h':'ₕ', 't':'ₜ', 'k':'ₖ', 'g':'𝗀'}
        return (aliases.get(symbol, '\0') in text or
                re.search(r'(?<![A-Za-z])'+symbol+r'(?![A-Za-z])', unicodedata.normalize('NFKD', text)) is not None)
    return symbol in text

def rename_symbols(text, changes):
    # Rename mathematical variable tokens only, never substrings of prose.
    if not changes:
        return text
    atoms = [r'(?<![A-Za-z])'+re.escape(symbol)+r'(?![A-Za-z])'
             if symbol.isascii() and symbol.isalpha() else re.escape(symbol)
             for symbol in sorted(changes,key=len,reverse=True)]
    return re.sub(r'\be\.g\.|\bi\.e\.|'+'|'.join(atoms),
                  lambda match: changes.get(match.group(),match.group()), text)

def named_bound(names, before, notation):
    assert all(p['symbol'] != 'class' for p in names), 'A named parameter needs its mathematical symbol, not the placeholder class'
    parameters = [p | {'introduced':symbol_is_introduced(p['symbol'], before), 'displaySymbol':True} for p in names]
    for p in parameters:
        notation.setdefault(p['symbol'], symbol_tex(p['symbol'], notation))
    function = 'F' if any(re.match(r'^f(?:$|\()', p['symbol']) for p in parameters) else 'f'
    label = function+'('+', '.join(p['symbol'] for p in parameters)+')'
    notation[label] = function+r'\bigl('+','.join(notation[p['symbol']] for p in parameters)+r'\bigr)'
    return label, parameters

def compile_graph_notation(catalog, registry):
    """Attach reviewed prose/math parts without changing graph identities.

    Short labels are materialized for fast client lookup. The compact literal
    fragment registry handles longer explanations at display time, avoiding a
    second serialized copy of generated provenance paragraphs.
    """
    assert registry.get('version') == 1, 'Unsupported graph notation version'
    notation = catalog['notation']
    for label, tex in registry.get('notation', {}).items():
        assert isinstance(label, str) and label and isinstance(tex, str) and tex, 'Empty graph math notation'
        assert label not in notation or notation[label] == tex, f'Conflicting graph math notation: {label}'
        notation[label] = tex
    fragments = registry.get('fragments')
    assert isinstance(fragments, dict) and fragments, 'Missing graph math fragments'
    assert not {'a', 'A'} & fragments.keys(), 'Unqualified prose article in graph math fragments'

    def plain(parts):
        return ''.join(part if isinstance(part, str) else part['math'] for part in parts)

    for fragment, parts in fragments.items():
        assert isinstance(fragment, str) and fragment, 'Empty graph math fragment'
        assert isinstance(parts, list) and parts, f'Empty graph math parts: {fragment}'
        assert all(isinstance(part, str) or (
            isinstance(part, dict) and set(part) == {'math'} and
            isinstance(part['math'], str) and part['math'] in notation
        ) for part in parts), f'Invalid graph math parts: {fragment}'
        assert plain(parts) == fragment, f'Graph math parts differ from text: {fragment}'
    # A single longest-first matcher preserves explicit mathematical phrases.
    # Boundaries protect words such as "H" inside "Hence" and "K8" in IDs.
    patterns = []
    for fragment in sorted(fragments, key=lambda value: (-len(value), value)):
        left = r'(?<![A-Za-z0-9])' if fragment[0].isascii() and fragment[0].isalnum() else ''
        right = r'(?![A-Za-z0-9])' if fragment[-1].isascii() and fragment[-1].isalnum() else ''
        patterns.append(left + re.escape(fragment) + right)
    matcher = re.compile('|'.join(patterns))

    def split(value):
        output, offset = [], 0
        for match in matcher.finditer(value):
            if match.start() > offset:
                output.append(value[offset:match.start()])
            output.extend(part.copy() if isinstance(part, dict) else part for part in fragments[match.group()])
            offset = match.end()
        if offset < len(value):
            output.append(value[offset:])
        merged = []
        for part in output:
            if isinstance(part, str) and merged and isinstance(merged[-1], str):
                merged[-1] += part
            elif part != '':
                merged.append(part)
        output = merged
        assert plain(output) == value, f'Graph math changed source text: {value}'
        return output

    values = set()
    network = catalog.get('graphNetwork', {})
    for node in network.get('nodes', []):
        values.update([node['label'], node.get('description', ''), *node.get('aliases', [])])
    values.update(edge['reason'] for edge in network.get('edges', []))
    for scope in network.get('scopes', {}).values():
        if isinstance(scope, dict) and scope.get('note'):
            values.add(scope['note'])
    values.update(network.get('prerequisites', {}).values())
    for row in catalog.get('results', []):
        values.update(row.get(field, '') for field in ('graphClass', 'graphClassSource', 'prerequisite'))
    facts = catalog.get('conditions', {})
    for fact in facts.values():
        if fact['kind'] == 'graph' or len(fact['label']) <= 320:
            values.add(fact['label'])
    mapping = {}
    for value in sorted(values):
        if value:
            parts = split(value)
            if any(isinstance(part, dict) for part in parts):
                mapping[value] = parts
    # Existing reviewed parts remain explicit. Enrich only their prose pieces,
    # so a formula that already owns its TeX is never parsed or split again.
    for fact in facts.values():
        if 'parts' in fact:
            parts = []
            for part in fact['parts']:
                parts.extend(split(part) if isinstance(part, str) else [part])
            fact['parts'] = parts
        elif fact['label'] in mapping:
            fact['parts'] = mapping[fact['label']]
    catalog['graphNotation'] = mapping
    catalog['graphMathFragments'] = fragments
    return {'labels': len(mapping), 'fragments': len(fragments)}

def approximation_factor(label, tex):
    match = re.fullmatch(r'(.+?)\s+(of|against)\s+(?:fractional\s+)?OPT', label)
    if not match:
        return label, tex
    if match[2]=='of':
        suffix = r'(?:\\[,;!]|\\(?:quad|qquad)|\s)*\\mathrm\{OPT\}(?:_\{(?:\\mathrm\{frac\}|f)\})?\s*$'
    else:
        suffix = r'(?:\\[,;!]|\\(?:quad|qquad)|\s)*\\text\{against fractional OPT\}\s*$'
    factor = re.sub(suffix, '', tex)
    assert factor != tex and factor.strip(), f'Cannot separate approximation factor from benchmark: {label}'
    return match[1], factor.strip()

def has_parameter_dependent_constant(tex):
    # Check the rendered TeX, which also covers Unicode/subscript source labels
    # and nested guarantees produced by reductions. O(1) additive terms remain
    # valid when their constant is independent of the displayed parameters.
    normalized = re.sub(r'\\(?:left|right|big[lrm]?|Big[lrm]?|bigg[lrm]?|Bigg[lrm]?)\b|\\[!,;: ]', '', tex)
    subscript = r'(?:\{(?:[^{}]|\{[^{}]*\})*\}|\\[A-Za-z]+|[^\s\\{}])'
    return re.search(r'(?<![A-Za-z])O\s*_\s*'+subscript+r'\s*\(\s*1\s*\)', normalized) is not None

def lower_approximation(label, tex):
    """Write ratio lower bounds without changing their strictness or source text."""
    if match := re.fullmatch(r'No \((.+)\)-approximation', label):
        prefix, suffix = r'\text{No }', r'\text{-approximation}'
        assert tex.startswith(prefix) and tex.endswith(suffix), label
        body = tex[len(prefix):-len(suffix)]
        if body.startswith(r'\left(') and body.endswith(r'\right)'):
            body = body[len(r'\left('):-len(r'\right)')]
        else:
            assert body.startswith('(') and body.endswith(')'), label
            body = body[1:-1]
        return '> '+match[1], '> '+body
    for wording, prefix in [('No ratio < ', r'\text{No ratio }<'),
                            ('No factor smaller than ', r'\text{No factor smaller than }')]:
        if label.startswith(wording):
            assert tex.startswith(prefix), label
            return '≥ '+label[len(wording):], r'\ge '+tex[len(prefix):]
    if match := re.fullmatch(r'No o\((.+)\)-approximation', label):
        prefix, suffix = r'\text{No }o', r'\text{-approximation}'
        assert tex.startswith(prefix) and tex.endswith(suffix), label
        return 'Ω('+match[1]+')', r'\Omega'+tex[len(prefix):-len(suffix)]
    return label, tex

def fixed_round_budget(result):
    label = result.get('roundsDisplay', result['rounds'])
    match = re.fullmatch(r'(?:≤\s*)?(\d+)(?:\s+rounds?)?', label.strip())
    return int(match[1]) if match else None

def is_constant_approximation(tex, reviewed_universal=False):
    """Accept only positive numerical factors in a small, explicit TeX grammar.

    Unknown commands, variables, functions and prose fail closed. A reviewed
    universal constant may also occur under the engine's numerical factor
    operations; the placeholder value only checks that numerical syntax.
    """
    if reviewed_universal:
        tex = tex.replace(r'\text{Constant}', '1')
    layout = {
        r'\,', r'\;', r'\:', r'\!', r'\ ', r'\quad', r'\qquad',
        r'\enspace', r'\thinspace', r'\medspace', r'\thickspace',
        r'\left', r'\right', r'\big', r'\Big', r'\bigg', r'\Bigg',
        r'\bigl', r'\bigr', r'\Bigl', r'\Bigr', r'\biggl', r'\biggr',
        r'\Biggl', r'\Biggr', r'\displaystyle', r'\textstyle',
        r'\scriptstyle', r'\scriptscriptstyle',
    }
    commands = {r'\cdot':'*', r'\times':'*', r'\div':'/',
                r'\frac':'frac', r'\dfrac':'frac', r'\tfrac':'frac',
                r'\{':'{', r'\}':'}'}
    relations = {r'\ge', r'\geq', r'\le', r'\leq', r'\gt', r'\lt'}
    tokens, pos = [], 0
    while pos < len(tex):
        if tex[pos].isspace():
            pos += 1
            continue
        if tex[pos] == '\\':
            match = re.match(r'\\(?:[A-Za-z]+|.)', tex[pos:])
            if not match:
                return False
            command = match.group()
            pos += len(command)
            if command in layout:
                continue
            if command in commands:
                tokens.append(commands[command])
            elif command in relations:
                tokens.append('relation')
            else:
                return False
        elif match := re.match(r'(?:\d+(?:\.\d*)?|\.\d+)', tex[pos:]):
            tokens.append(match.group())
            pos += len(match.group())
        elif tex[pos] in '+-*/^(){}[]':
            tokens.append(tex[pos])
            pos += 1
        elif tex[pos] in '<>≤≥=':
            tokens.append('relation')
            pos += 1
        else:
            return False
    if tokens and tokens[0] == 'relation':
        tokens.pop(0)
    index = 0

    def peek():
        return tokens[index] if index < len(tokens) else None

    def group(opening):
        nonlocal index
        if peek() != opening:
            raise ValueError('Expected numerical group')
        index += 1
        value = expression()
        if peek() != {'(':')', '{':'}', '[':']'}[opening]:
            raise ValueError('Unbalanced numerical group')
        index += 1
        return value

    def atom():
        nonlocal index
        token = peek()
        if token in {'(', '{', '['}:
            return group(token)
        if token == 'frac':
            index += 1
            return group('{') / group('{')
        if token is None or not re.fullmatch(r'(?:\d+(?:\.\d*)?|\.\d+)', token):
            raise ValueError('Expected numerical factor')
        index += 1
        return Fraction(token)

    def power():
        nonlocal index
        value = atom()
        if peek() == '^':
            index += 1
            exponent = unary()
            if exponent.denominator != 1:
                raise ValueError('Unsupported noninteger exponent')
            value **= exponent.numerator
        return value

    def unary():
        nonlocal index
        if peek() in {'+', '-'}:
            sign = peek()
            index += 1
            return unary() * (-1 if sign == '-' else 1)
        return power()

    def product():
        nonlocal index
        value = unary()
        while peek() is not None:
            token = peek()
            if token in {'*', '/'}:
                index += 1
                operand = unary()
                value = value * operand if token == '*' else value / operand
            elif token in {'(', '{', '[', 'frac'} or re.fullmatch(r'(?:\d+(?:\.\d*)?|\.\d+)', token):
                value *= unary()
            else:
                break
        return value

    def expression():
        nonlocal index
        value = product()
        while peek() in {'+', '-'}:
            operator = peek()
            index += 1
            operand = product()
            value = value + operand if operator == '+' else value - operand
        return value

    try:
        value = expression()
        return index == len(tokens) and value > 0
    except (ValueError, ZeroDivisionError, OverflowError, RecursionError):
        return False

def build():
    papers, results = [], []
    paths = [ROOT/'dist/data/sparse.json', ROOT/'dist/data/general.json']
    if (ROOT/'dist/data/picavet.json').exists():
        paths.append(ROOT/'dist/data/picavet.json')
    paths.append(ROOT/'dist/data/folklore.json')
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
        if p.get('type') == 'phdthesis':
            assert isinstance(p.get('school'), str) and p['school'], p['id']
    for r in results:
        assert required <= r.keys(), f"{r.get('id')}: missing {required - r.keys()}"
        assert r['paperId'] in paper_ids, r['id']
        assert isinstance(r['year'], int) and 1950 <= r['year'] <= 2026, r['id']
        for key, allowed in enums.items():
            assert r[key] in allowed, f"{r['id']}: invalid {key}: {r[key]}"
        assert urlparse(r['sourceUrl']).scheme == 'https', r['id']
        for key in required - {'year'}:
            assert isinstance(r[key], str), f"{r['id']}: {key} must be text"
        if 'attribution' in r:
            assert r['attribution'] == 'folklore', r['id']
            assert all(isinstance(r.get(key),str) and r[key] for key in ('algorithm','proofSketch','proofFormula','provenanceNote')), r['id']
    notation = json.loads((ROOT/'dist/data/notation.json').read_text())
    for r in results:
        for field in ('approximation', 'rounds'):
            assert r[field] in notation, f"{r['id']}: missing TeX notation for {field}"
        if r.get('proofFormula'):
            assert r['proofFormula'] in notation, f"{r['id']}: missing proof-formula TeX"
    result_map = {r['id']: r for r in results}
    problem_network = json.loads((ROOT/'dist/data/problems.json').read_text())
    problem_nodes = {n['id']: n for n in problem_network['nodes']}
    assert len(problem_nodes) == len(problem_network['nodes']), 'Duplicate problem node'
    problem_aliases = {}
    for node in problem_nodes.values():
        parameter_names = [node['parameter']['template'].format(parameter=value) for value in node.get('parameter', {}).get('values', [])]
        for name in [node['id'], node['label'], *node['aliases'], *parameter_names]:
            name = unicodedata.normalize('NFKD', name).casefold()
            assert name not in problem_aliases or problem_aliases[name] == node['id'], f'Ambiguous problem alias: {name}'
            problem_aliases[name] = node['id']
    problem_pairs = set()
    for edge in problem_network['edges']:
        assert edge['special'] in problem_nodes and edge['general'] in problem_nodes and edge['special'] != edge['general'], edge
        pair = (edge['special'], edge['general'])
        assert pair not in problem_pairs, f'Duplicate problem relation: {pair}'
        problem_pairs.add(pair)
        assert edge['kind'] in {'special-case', 'relaxation', 'approximation-reduction'} and edge['reason'], edge
        assert isinstance(edge['upper'], bool) and isinstance(edge['lower'], bool), edge
        assert edge['reference'] in problem_network['references'], edge
        if edge['kind'] == 'relaxation':
            assert not edge['upper'] and not edge['lower'], 'Relaxations cannot transfer integral bounds'
        if edge['kind'] == 'approximation-reduction':
            assert not edge['upper'] and not edge['lower'], 'Approximation reductions are not identity problem inclusions'
            assert isinstance(edge.get('reductions'), list) and edge['reductions'], edge
            assert len(set(edge['reductions'])) == len(edge['reductions']) and all(isinstance(rid, str) and rid for rid in edge['reductions']), edge
    assert set(problem_network['overrides']) <= result_map.keys(), 'Unknown problem-scope override'
    assert set(problem_network.get('resultParameters', {})) <= result_map.keys(), 'Unknown result parameter'
    for node in problem_nodes.values():
        if 'parameter' in node:
            parameter = node['parameter']
            assert parameter['name'] and parameter['symbol'] in parameter['values'], node['id']
            assert parameter['template'].count('{parameter}') == 1, node['id']
            assert parameter['template'].format(parameter=parameter['symbol']) == node['label'], node['id']
    for ref in problem_network['references'].values():
        assert urlparse(ref['url']).scheme == 'https', ref
    for r in results:
        scope = problem_network['overrides'].get(r['id'], problem_network['scopes'].get(r['problem']))
        if not scope:
            scope = problem_aliases.get(unicodedata.normalize('NFKD', r['problem']).casefold())
        assert scope, f"{r['id']}: missing problem scope"
        scope = {'node':scope} if isinstance(scope,str) else scope
        assert scope['node'] in problem_nodes, r['id']
        r['problemScope'] = scope
        node = problem_nodes[scope['node']]
        label = node['label']
        parameter = node.get('parameter')
        if parameter:
            symbol = problem_network.get('resultParameters', {}).get(r['id'], parameter['symbol'])
            assert symbol in parameter['values'], r['id']
            label = parameter['template'].format(parameter=symbol)
            r['problemParameter'] = symbol
            r['problemParameterName'] = parameter['name']
        else:
            assert r['id'] not in problem_network.get('resultParameters', {}), r['id']
        if label != r['problem']:
            r['problemSource'] = r['problem']
            r['problem'] = label
    graph_network = json.loads((ROOT/'dist/data/graph-classes.json').read_text())
    node_ids = {n['id'] for n in graph_network['nodes']}
    assert len(node_ids) == len(graph_network['nodes']), 'Duplicate graph-class node'
    edge_pairs = set()
    for edge in graph_network['edges']:
        assert edge['subset'] in node_ids and edge['superset'] in node_ids and edge['subset'] != edge['superset'], edge
        pair = (edge['subset'],edge['superset'])
        assert pair not in edge_pairs, f'Duplicate inclusion: {pair}'
        edge_pairs.add(pair)
        assert edge['reason'] and isinstance(edge['lower'], bool), edge
        if 'parameterBindings' in edge:
            assert isinstance(edge['parameterBindings'], dict) and edge['parameterBindings'], edge
            assert all(re.fullmatch(r'[a-z][a-z0-9-]*', role) and isinstance(value, str) and value for role,value in edge['parameterBindings'].items()), edge
        if 'reference' in edge:
            assert edge['reference'] in graph_network['references'], edge
    assert set(graph_network['prerequisites']) <= result_map.keys(), 'Unknown prerequisite result'
    class_aliases = graph_network.get('displayAliases', {})
    assert set(class_aliases) <= graph_network['scopes'].keys(), 'Unknown class display alias'
    canonical_scopes = {}
    scope_lookup = dict(graph_network['scopes'])
    graph_aliases = {}
    for node in graph_network['nodes']:
        for name in [node['id'],node['label'],*node['aliases']]:
            key = unicodedata.normalize('NFKD',name).casefold()
            assert key not in graph_aliases or graph_aliases[key] == node, f'Ambiguous graph alias: {name}'
            graph_aliases[key] = node
    for source, scope in graph_network['scopes'].items():
        canonical = class_aliases.get(source, source)
        assert isinstance(canonical, str) and canonical, source
        assert canonical not in canonical_scopes or canonical_scopes[canonical] == scope['node'], f'Conflicting class alias: {canonical}'
        canonical_scopes[canonical] = scope['node']
        scope_lookup.setdefault(canonical, scope)
    for reference in graph_network['references'].values():
        assert urlparse(reference['url']).scheme == 'https', reference
    for r in results:
        source_class = r['graphClass']
        known_class = graph_aliases.get(unicodedata.normalize('NFKD',source_class).casefold())
        scope = scope_lookup.get(source_class) or ({'node':known_class['id']} if known_class else None)
        assert scope, f"{r['id']}: missing graph-class scope"
        assert scope['node'] in node_ids, r['id']
        r['graphScope'] = scope
        canonical = class_aliases.get(source_class, source_class if source_class in scope_lookup else known_class['label'])
        if canonical != r['graphClass']:
            r['graphClassSource'] = r['graphClass']
            r['graphClass'] = canonical
        if r['id'] in graph_network['prerequisites']:
            r['prerequisite'] = graph_network['prerequisites'][r['id']]
    labels = json.loads((ROOT/'dist/data/round-labels.json').read_text())
    parameter_registry = json.loads((ROOT/'dist/data/parameters.json').read_text())
    parameter_entries = validate_registry(parameter_registry, result_map)
    for r in results:
        if 'graphParameterRoles' in r:
            roles = r['graphParameterRoles']
            assert isinstance(roles, dict) and roles, r['id']
            assert all(re.fullmatch(r'[a-z][a-z0-9-]*', role) and symbol in {p['symbol'] for p in parameter_entries.get(r['id'], [])} for role,symbol in roles.items()), r['id']
    for definitions in parameter_entries.values():
        for definition in definitions:
            notation.setdefault(definition['symbol'], definition.get('tex') or symbol_tex(definition['symbol'], notation))
    parameter_symbols = labels.get('symbols', {})
    assert all(isinstance(name,str) and isinstance(symbol,str) and len(symbol)==1 and symbol.isalpha()
               for name,symbol in parameter_symbols.items())
    parameter_roles = labels.get('parameterRoles', {})
    assert set(parameter_roles) <= result_map.keys(), 'Unknown result in parameterRoles'
    for roles in parameter_roles.values():
        assert all(set(p)=={'symbol','name'} and p['symbol'] and p['name'] for p in roles)
    assert set(labels['results']) <= result_map.keys(), 'Unknown result in round-labels.json'
    approximation_names = labels.get('approximationResults', {})
    fractional_benchmarks = set(labels.get('fractionalBenchmarks', []))
    parameter_rounds = set(labels.get('parameterRounds', []))
    universal = {field:set(ids) for field,ids in labels['universalConstants'].items()}
    assert set(approximation_names) <= result_map.keys(), 'Unknown approximation parameter label'
    assert fractional_benchmarks <= result_map.keys(), 'Unknown fractional optimum benchmark'
    assert parameter_rounds <= result_map.keys(), 'Unknown parameter-dependent round result'
    for field, ids in universal.items():
        assert field in {'approximation','rounds'} and ids <= result_map.keys(), field
        named_ids = set(approximation_names) if field=='approximation' else set(labels['results'])
        assert not ids & named_ids, f'{field}: a universal constant cannot also have named dependencies'
    assert set(labels['expressions']) <= {r['rounds'] for r in results}, 'Unused round expression label'
    replacements = {'O(1)':'Constant', 'O(1) rounds ruled out':'Constant rounds ruled out', 'O(1)-round impossibility':'Constant-round impossibility'}
    for text in replacements.values():
        notation[text] = r'\text{'+text+'}'
    for r in results:
        names = labels['results'].get(r['id'], labels['expressions'].get(r['rounds']))
        ratio_names = approximation_names.get(r['id'])
        if names:
            names = named_parameters(names, parameter_entries.get(r['id'], []))
        if ratio_names:
            ratio_names = named_parameters(ratio_names, parameter_entries.get(r['id'], []))
        bindings = list(names or []) + list(ratio_names or []) + parameter_roles.get(r['id'], [])
        assert all(set(p)=={'symbol','name'} and p['symbol'] and p['name'] for p in bindings), r['id']
        changes = {p['symbol']:parameter_symbols[p['name']] for p in bindings
                   if p['name'] in parameter_symbols and p['symbol'] != parameter_symbols[p['name']]}
        assert all(parameter_symbols[p['name']]==changes[p['symbol']] for p in bindings
                   if p['name'] in parameter_symbols and p['symbol'] in changes), f"{r['id']}: conflicting parameter roles"
        if changes:
            r['notationChanges'] = [{'name':p['name'],'sourceSymbol':p['symbol'],'symbol':changes[p['symbol']]}
                                    for p in bindings if p['symbol'] in changes]
            for field in ('parameters','assumptions','variant','summary'):
                normalized = rename_symbols(r[field],changes)
                if normalized != r[field]:
                    r[field+'Source'] = r[field]
                    r[field] = normalized
        for field in ('approximation','rounds'):
            dependencies = ratio_names if field=='approximation' else names
            if r[field] in replacements and not dependencies:
                assert r['id'] in universal[field], f"{r['id']}: {field} needs verified universal-constant status or explicit parameter dependence"
            display = rename_symbols(replacements.get(r[field],r[field]),changes)
            if display != r[field] and display not in notation:
                notation[display] = substitute_tex(notation[r[field]],changes,notation)
            r[field+'Display'] = display
        if ratio_names:
            ratio_names = [p | {'symbol':parameter_symbols.get(p['name'],p['symbol'])} for p in ratio_names]
            before = ' '.join(r[k] for k in ('problem','graphClass','variant'))
            r['approximationDisplay'], r['approximationParameters'] = named_bound(ratio_names, before, notation)
        if 'fractional OPT' in r['approximation'] or r['id'] in fractional_benchmarks:
            r['approximationBenchmark'] = 'fractional'
        label = r['approximationDisplay']
        factor, tex = approximation_factor(label, notation[label])
        if factor != label:
            notation.setdefault(factor, tex)
            r['approximationDisplay'] = factor
        if r['bound']=='lower':
            label = r['approximationDisplay']
            factor, tex = lower_approximation(label, notation[label])
            if factor != label:
                notation.setdefault(factor, tex)
                r['approximationDisplay'] = factor
        if names:
            assert r['roundClass'] in {'constant','parameter'}, r['id']
            assert all(set(p) == {'symbol','name'} and p['symbol'] and p['name'] for p in names), r['id']
            names = [p | {'symbol':parameter_symbols.get(p['name'],p['symbol'])} for p in names]
            before = ' '.join(r[k] for k in ('problem','graphClass','variant','approximationDisplay'))
            r['roundsDisplay'], r['roundParameters'] = named_bound(names, before, notation)
            if r['bound']=='lower':
                r['roundBudgetExcluded'] = True
                label = r['roundsDisplay']
                r['roundsDisplay'] += ' rounds ruled out'
                notation[r['roundsDisplay']] = notation[label]+r'\text{ rounds ruled out}'
        if r['roundClass']=='constant':
            if names or r['id'] in parameter_rounds:
                r['roundClassSource'] = r['roundClass']
                r['roundClass'] = 'parameter'
            else:
                assert r['id'] in universal['rounds'] or re.fullmatch(r'\d+(?: rounds?)?',r['rounds']), f"{r['id']}: classify the full dependence of the round complexity"
        elif r['roundClass']=='parameter':
            assert names or r['id'] in parameter_rounds, f"{r['id']}: specify the parameter-dependent round complexity"
        if 'relatedResults' in r:
            assert isinstance(r['relatedResults'], list) and len(set(r['relatedResults'])) == len(r['relatedResults']), r['id']
            assert all(rid in result_map and rid != r['id'] for rid in r['relatedResults']), r['id']
    # Audit raw universal O(1) statements only after their existing field-specific
    # checks. A new unreviewed constant must still fail with the policy error
    # above, rather than an unrelated missing-count annotation.
    round_counts = json.loads((ROOT/'dist/data/round-counts.json').read_text())
    assert isinstance(round_counts.get('checked'), str) and round_counts['checked'], 'Round-count audit needs a check date'
    assert isinstance(round_counts.get('description'), str) and round_counts['description'], 'Round-count audit needs a description'
    assert isinstance(round_counts.get('entries'), list), 'Round-count audit entries must be a list'
    count_ids = set()
    count_bases = {'stated','same-algorithm','phase-count','not-specified','unavailable'}
    for entry in round_counts['entries']:
        assert isinstance(entry, dict), 'Invalid round-count audit entry'
        assert {'resultIds','basis','explanation','evidence'} <= entry.keys(), 'Incomplete round-count audit entry'
        assert set(entry) <= {'resultIds','rounds','basis','explanation','evidence'}, 'Unknown round-count audit field'
        ids = entry['resultIds']
        assert isinstance(ids, list) and ids and all(isinstance(rid, str) for rid in ids), 'Round-count resultIds must be nonempty'
        assert len(set(ids)) == len(ids), f'Duplicate round-count result ID in entry: {ids}'
        assert isinstance(entry['basis'], str) and entry['basis'] in count_bases, f'Invalid round-count evidence basis: {entry["basis"]}'
        assert isinstance(entry['explanation'], str) and entry['explanation'].strip(), f'Missing round-count explanation: {ids}'
        assert isinstance(entry['evidence'], list) and entry['evidence'], f'Missing round-count evidence: {ids}'
        for evidence in entry['evidence']:
            assert isinstance(evidence, dict) and all(isinstance(evidence.get(key), str) and evidence[key].strip()
                                                    for key in ('url','title','location')), f'Invalid round-count source: {ids}'
            parsed = urlparse(evidence['url'])
            assert parsed.scheme == 'https' and parsed.netloc, f'Round-count source must use HTTPS: {ids}'
        if 'rounds' in entry:
            assert isinstance(entry['rounds'], str) and re.fullmatch(r'(?:≤ )?\d+', entry['rounds']), f'Invalid explicit round count: {ids}'
            assert entry['rounds'] in notation, f'Missing round-count TeX notation: {entry["rounds"]}'
            assert entry['basis'] not in {'not-specified','unavailable'}, f'Unverified numeric round count: {ids}'
        for rid in ids:
            assert rid in result_map and rid not in count_ids, f'Unknown or duplicate round-count result: {rid}'
            r = result_map[rid]
            assert r['bound'] == 'upper' and r['rounds'] == 'O(1)', f'Round-count evidence requires an upper-bound O(1) source: {rid}'
            assert rid in universal['rounds'] and r['roundClass'] == 'constant' and not r.get('roundParameters'), f'Round-count evidence requires a reviewed universal constant without runtime parameters: {rid}'
            r['roundCountEvidence'] = {key:value for key,value in entry.items() if key != 'resultIds'} | {'checked':round_counts['checked']}
            if 'rounds' in entry:
                r['roundsDisplay'] = entry['rounds']
            count_ids.add(rid)
    expected_count_ids = {r['id'] for r in results if r['bound']=='upper' and r['rounds']=='O(1)' and r['roundClass']=='constant'}
    assert expected_count_ids <= count_ids, f'Missing universal round-count audit: {sorted(expected_count_ids-count_ids)}'
    compile_round_details(results, {p['id']:p for p in papers}, notation,
                          json.loads((ROOT/'dist/data/round-details.json').read_text()))
    sota_ids = set()
    for path in sorted((ROOT/'dist/data').glob('sota-*.json')):
        if path.name == 'sota-frontier.json':
            continue
        source = json.loads(path.read_text())
        for entry in source['entries']:
            rid = entry['resultId']
            assert rid in result_map and rid not in sota_ids, f'Unknown or duplicate SOTA result: {rid}'
            r = result_map[rid]
            assert not r.get('caveat') and r.get('status') != 'claimed', f'Unresolved claim marked SOTA: {rid}'
            assert r['verification'] == 'primary', f'SOTA requires primary evidence: {rid}'
            assert all(isinstance(entry[k], str) and entry[k] for k in ('setting','reason','evidenceUrl')), rid
            assert urlparse(entry['evidenceUrl']).scheme == 'https', rid
            r['sota'] = {k:v for k,v in entry.items() if k != 'resultId'} | {'checked':source['checked']}
            sota_ids.add(rid)
    frontier = json.loads((ROOT/'dist/data/sota-frontier.json').read_text())
    specializations = {}
    for certificate in frontier.get('algorithmSpecializations', []):
        cid = certificate['id']
        assert cid not in specializations, f'Duplicate algorithm specialization: {cid}'
        target, original = result_map[certificate['resultId']], result_map[certificate['sourceResultId']]
        assert target['id'] != original['id'], cid
        assert isinstance(target.get('algorithmFamily'), str) and target['algorithmFamily'] and target['algorithmFamily'] == original.get('algorithmFamily'), f'Algorithm specialization needs a shared protocol family: {cid}'
        assert target['verification'] == original['verification'] == 'primary' and not target.get('caveat') and not original.get('caveat') and target.get('status')!='claimed' and original.get('status')!='claimed', cid
        for field in ('bound','objective','variant','model','randomization','approximationDisplay','roundClass'):
            assert target[field] == original[field], f'Incompatible algorithm specialization {field}: {cid}'
        assert target['bound']=='upper' and target['problemScope']['node']==original['problemScope']['node'], cid
        assert target.get('approximationBenchmark','integral')==original.get('approximationBenchmark','integral'), cid
        assert certificate['graph']==original['graphScope']['node'], cid
        edge = next((e for e in graph_network['edges'] if e['subset']==certificate['graph'] and e['superset']==target['graphScope']['node']), None)
        assert edge and edge.get('parameterBindings')==certificate['parameterBindings'], f'Algorithm specialization needs its parameterized inclusion: {cid}'
        assert set(certificate['parameterBindings']) <= target.get('graphParameterRoles', {}).keys(), f'Undeclared graph parameter role: {cid}'
        assert original['roundComplexityDetails']['status']=='explicit' and original['roundComplexityDetails']['audited'], f'Algorithm specialization needs checked explicit rounds: {cid}'
        assert certificate['reason'] and certificate['evidence'], cid
        for evidence in certificate['evidence']:
            assert all(evidence.get(k) for k in ('url','title','location')) and urlparse(evidence['url']).scheme=='https', cid
        specializations[cid] = certificate
    dimensions = set(frontier['dimensions'])
    pairs = set()
    for comparison in frontier['dominance']:
        better, worse = comparison['better'], comparison['worse']
        assert better in result_map and worse in result_map and better != worse, comparison
        assert (better,worse) not in pairs, comparison
        pairs.add((better,worse))
        a,b = result_map[better],result_map[worse]
        assert a['bound'] == b['bound'] == 'upper' and a['objective'] == b['objective'], comparison
        assert a['problemScope']['node'] == b['problemScope']['node'], comparison
        assert a['verification'] == 'primary' and not a.get('caveat') and a.get('status') != 'claimed', comparison
        assert set(comparison['conditions']) == dimensions, comparison
        assert comparison['strict'] and set(comparison['strict']) <= dimensions, comparison
        assert all(isinstance(text,str) and text for text in comparison['conditions'].values()), comparison
        assert comparison['reason'] and urlparse(comparison['evidenceUrl']).scheme == 'https', comparison
        if comparison.get('algorithmSpecialization'):
            identity = specializations[comparison['algorithmSpecialization']]
            assert identity['resultId']==better and identity['sourceResultId']==worse, comparison
            assert comparison.get('kind')=='family-extension' and comparison['strict']==['graphClass'], comparison
        elif comparison.get('kind')=='family-extension':
            raise AssertionError('Family coverage requires an explicit same-algorithm specialization')
        worse_budget = fixed_round_budget(b)
        if worse_budget is not None:
            better_budget = fixed_round_budget(a)
            # An unspecified constant or parameter function does not certify a
            # fixed round budget. A future parameter-identity certificate would
            # need an explicitly reviewed numerical instantiation here.
            assert better_budget is not None and better_budget <= worse_budget, f'Fixed-round dominance needs a verified no-larger numerical budget: {better} -> {worse}'
        if comparison.get('comparisonGraphClass'):
            assert comparison['comparisonGraphClass']['node'] in node_ids, comparison
        b.setdefault('frontierComparisons', []).append(comparison)
        if not comparison.get('domainGuard'):
            b.setdefault('dominatedBy', []).append(better)
    # A strict, unconditional Pareto improvement cannot form a cycle.
    def visit_frontier(rid, path):
        assert rid not in path, f'Cycle in strict SOTA dominance: {path + [rid]}'
        for better in result_map[rid].get('dominatedBy', []):
            visit_frontier(better, path + [rid])
    for rid in result_map:
        visit_frontier(rid, [])
    for transfer in frontier.get('scopeTransfers', []):
        assert transfer['resultId'] in sota_ids, transfer
        assert transfer.get('graph') in node_ids or transfer.get('problem') in problem_nodes, transfer
        assert not transfer.get('graph') or transfer['graph'] in node_ids, transfer
        assert not transfer.get('problem') or transfer['problem'] in problem_nodes, transfer
        assert all(isinstance(transfer.get(k),str) and transfer[k] for k in ('setting','reason','scopeLabel','evidenceUrl')), transfer
        assert urlparse(transfer['evidenceUrl']).scheme == 'https', transfer
        if transfer.get('algorithmSpecialization'):
            identity = specializations[transfer['algorithmSpecialization']]
            assert identity['resultId']==transfer['resultId'] and identity['graph']==transfer.get('graph'), transfer
        if 'approximation' in transfer:
            specialization = transfer['approximation']
            assert isinstance(specialization, dict) and set(specialization) == {'substitutions','factor'}, f'Invalid approximation specialization: {transfer}'
            bindings = specialization['substitutions']
            assert isinstance(bindings, dict) and bindings and all(isinstance(key, str) and key.strip() and isinstance(value, str) and value.strip() for key,value in bindings.items()), f'Invalid approximation specialization bindings: {transfer}'
            source = result_map[transfer['resultId']]
            source_tex = notation[source['approximationDisplay']]
            for symbol in bindings:
                # This checks atom occurrence only; the reviewed output factor
                # below is not inferred by textual algebra or simplification.
                assert substitute_tex(source_tex, {symbol:'scopeBinding'}, notation) != source_tex, f'Unknown approximation specialization symbol {symbol}: {transfer["resultId"]}'
            factor = specialization['factor']
            assert isinstance(factor, str) and factor in notation, f'Unknown approximation specialization factor: {transfer}'
            assert is_constant_approximation(notation[factor]), f'Approximation specialization needs a positive numerical factor: {transfer}'
            specialization['constantApproximation'] = True
        result_map[transfer['resultId']].setdefault('sotaScopeTransfers', []).append(transfer)
    for r in results:
        r['frontierStatus'] = 'dominated' if r.get('dominatedBy') else 'frontier' if r.get('sota') else 'unreviewed'
    condition_registry = json.loads((ROOT/'dist/data/conditions.json').read_text())
    condition_facts = condition_registry['facts']
    variant_weights = {profile['value']: profile['weights'] for profile in condition_registry['variants']}
    result_weights = {profile['resultId']: profile['weights'] for profile in condition_registry['profiles'] if 'weights' in profile}
    for row in results:
        # Exact reviewed variant profiles establish weight support; theorem
        # prose and substring matching cannot authorize a guarded recipe.
        row['weightCondition'] = result_weights.get(row['id'], variant_weights.get(row['variant'], 'weights-unspecified'))
        assert condition_facts.get(row['weightCondition'], {}).get('kind') == 'weights', row['id']
        if 'inputConditions' in row:
            assert isinstance(row['inputConditions'], list) and len(set(row['inputConditions'])) == len(row['inputConditions']), row['id']
            assert all(condition_facts.get(fid, {}).get('kind') == 'input' for fid in row['inputConditions']), row['id']
    reductions = json.loads((ROOT/'dist/data/reductions.json').read_text())
    recipe_ids = set()
    for entry in reductions['entries']:
        assert entry['id'] not in recipe_ids, 'Duplicate reduction ID'
        recipe_ids.add(entry['id'])
        assert entry['from'] in problem_nodes and entry['to'] in problem_nodes, entry['id']
        assert entry['from'] != entry['to'] and entry['conditions'], entry['id']
        assert entry['status'] in {'automatic','conditional','relaxation'}, entry['id']
        assert set(entry['models']) <= enums['model'], entry['id']
        assert urlparse(entry['source']['url']).scheme == 'https', entry['id']
        engine = entry.get('engine')
        if engine:
            assert entry['status'] != 'relaxation', entry['id']
            assert engine['mode'] in {'identity','simulation','rounding','parameters'}, entry['id']
            assert engine['cost'] in {'T','2T','T+1','T+4','O(T)','O(T+1)'}, entry['id']
            assert engine['factor'] in {'identity','double','multiply'}, entry['id']
            assert engine['targetVariant'] in {'Unweighted','preserve'}, entry['id']
            assert set(engine.get('sourceScopes',[entry['to']])) <= problem_nodes.keys(), entry['id']
            guards = engine.get('sourceGuards', {})
            assert isinstance(guards, dict) and set(guards) <= {'objective','weightCondition','outputKind','benchmarks'}, entry['id']
            if 'objective' in guards:
                assert guards['objective'] in enums['objective'], entry['id']
            if 'weightCondition' in guards:
                assert condition_facts.get(guards['weightCondition'], {}).get('kind') == 'weights', entry['id']
            if 'outputKind' in guards:
                assert guards['outputKind'] in {node.get('outputKind') for node in problem_nodes.values()}, entry['id']
            if 'benchmarks' in guards:
                assert isinstance(guards['benchmarks'], list) and guards['benchmarks'] and set(guards['benchmarks']) <= {'integral','fractional'}, entry['id']
            if 'targetBenchmark' in engine:
                assert engine['targetBenchmark'] in {'integral','fractional'}, entry['id']
            if 'targetInputConditions' in engine:
                conditions = engine['targetInputConditions']
                assert isinstance(conditions, list) and len(set(conditions)) == len(conditions), entry['id']
                assert all(condition_facts.get(fid, {}).get('kind') == 'input' for fid in conditions), entry['id']
            if engine['factor'] == 'multiply':
                multiplier = engine.get('multiplier')
                assert isinstance(multiplier, dict) and set(multiplier) <= {'default','graphBounds'}, entry['id']
                assert isinstance(multiplier.get('default'), dict), entry['id']
                bounds = multiplier.get('graphBounds', [])
                assert isinstance(bounds, list), entry['id']
                assert all(isinstance(bound, dict) and bound.get('graph') in node_ids for bound in bounds), entry['id']
                assert len({bound['graph'] for bound in bounds}) == len(bounds), entry['id']
                for bound in [multiplier['default'], *bounds]:
                    assert all(isinstance(bound.get(key), str) and bound[key].strip() for key in ('label','tex')), entry['id']
                    assert r'\\' not in bound['tex'], entry['id']
                    if re.fullmatch(r'-?\d+(?:\.\d+)?', bound['tex']):
                        assert float(bound['tex']) > 0, entry['id']
                    if 'source' in bound:
                        assert isinstance(bound['source'], dict) and urlparse(bound['source']['url']).scheme == 'https', entry['id']
            elif 'multiplier' in engine:
                raise AssertionError('A multiplier requires factor=multiply: '+entry['id'])
            if 'parameterDefinitions' in entry:
                validate_registry({'version':1, 'results':{entry['id']:entry['parameterDefinitions']}}, {entry['id']})
            if engine['graphMap'] != 'same':
                assert isinstance(engine['graphMap'],dict), entry['id']
                assert set(engine['graphMap']) <= node_ids and set(engine['graphMap'].values()) <= node_ids, entry['id']
            if engine.get('lower'):
                assert engine['cost'] == 'T' and engine['factor'] == 'identity' and engine['graphMap'] == 'same', entry['id']
                assert not engine.get('targetInputConditions'), entry['id']
    recipes_by_id = {entry['id']: entry for entry in reductions['entries']}
    for edge in problem_network['edges']:
        if edge['kind'] == 'approximation-reduction':
            assert set(edge['reductions']) <= recipe_ids, edge
            for rid in edge['reductions']:
                recipe = recipes_by_id[rid]
                assert recipe['from'] == edge['special'] and recipe['to'] == edge['general'], (rid,edge)
                assert recipe.get('engine', {}).get('upper') and not recipe['engine'].get('lower'), rid
    for label, tex in reductions.get('notation',{}).items():
        assert label not in notation or notation[label] == tex, f'Conflicting reduction notation: {label}'
        notation[label] = tex
    source_results = results
    derived = derive_results(source_results, notation, problem_network, graph_network, reductions)
    all_ids = {r['id'] for r in source_results + derived}
    assert len(all_ids) == len(source_results) + len(derived), 'Duplicate generated result ID'
    for r in derived:
        assert required <= r.keys() and r['verification'] == 'derived', r['id']
        assert r['sourceResultId'] in result_map and r['parentResultId'] in all_ids, r['id']
        assert r['paperId'] == result_map[r['sourceResultId']]['paperId'], r['id']
        assert set(r['reductionPath']) <= recipe_ids, r['id']
        assert r['roundsDisplay'] in notation and r['approximationDisplay'] in notation, r['id']
        # Only a separately curated certificate for this exact target setting
        # may accompany a consequence; a solver's SOTA flag is never inherited.
        source = result_map[r['sourceResultId']]
        if len(r['reductionPath']) == 1:
            recipe = next(e for e in reductions['entries'] if e['id'] == r['reductionPath'][0])
            engine = recipe['engine']
            if engine['cost'] == 'T' and engine['factor'] == 'identity' and engine['graphMap'] == 'same':
                projections = [t | {'checked':source['sota']['checked'],'sourceResultId':source['id']}
                               for t in source.get('sotaScopeTransfers',[])
                               if t.get('problem') == r['problemScope']['node'] and not source.get('dominatedBy')]
                if projections:
                    r['sotaProjections'] = projections
    results = source_results + derived
    for r in results:
        assert not has_parameter_dependent_constant(notation[r['approximationDisplay']]), (
            f"{r['id']}: approximation must display parameter-dependent constants as f(...); "
            "declare their parameters in round-labels.json approximationResults"
        )
        base_id = r.get('sourceResultId', r['id'])
        r['constantApproximation'] = is_constant_approximation(
            notation[r['approximationDisplay']], base_id in universal['approximation'])
    assert all('tightness' not in r for r in results), 'Tightness must come from reviewed matching-bound certificates'
    tight_bounds = json.loads((ROOT/'dist/data/tight-bounds.json').read_text())
    all_results = {r['id']:r for r in results}
    tight_ids = set()
    for certificate in tight_bounds['certificates']:
        cid = certificate['id']
        assert cid not in tight_ids, f'Duplicate tightness certificate: {cid}'
        tight_ids.add(cid)
        assert certificate['axis'] in {'ratio','rounds','approximation-order'}, cid
        assert certificate['precision'] in {'exact','asymptotic','threshold'}, cid
        assert all(isinstance(certificate.get(k),str) and certificate[k] for k in ('scopeLabel','parameterDomain','statement')), cid
        members = set()
        for side in ('upper','lower'):
            evidence = certificate[side]
            assert urlparse(evidence['url']).scheme=='https', cid
            assert all(isinstance(evidence.get(k),str) and evidence[k] for k in ('title','location','statement')), cid
            for rid in evidence['resultIds']:
                assert rid in all_results and all_results[rid]['bound']==side, (cid,rid)
                member = all_results[rid]
                assert member['verification'] in {'primary','derived'} and not member.get('caveat') and member.get('status')!='claimed', (cid,rid)
                members.add(rid)
        assert certificate['applications'], cid
        applications = set()
        for application in certificate['applications']:
            rid = application['resultId']
            assert rid in members and rid not in applications, (cid,rid)
            applications.add(rid)
            r = all_results[rid]
            assert r['verification'] in {'primary','derived'} and not r.get('caveat') and r.get('status')!='claimed', (cid,rid)
            assert application['graphs'] and set(application['graphs'])<=node_ids, (cid,rid)
            assert application['problems'] and set(application['problems'])<=problem_nodes.keys(), (cid,rid)
            assert application['models'] and set(application['models'])<=enums['model'], (cid,rid)
            r.setdefault('tightness',[]).append({'certificateId':cid,**application})
    catalog = {'updated':'2026-11-16','papers':papers,'sourceResults':source_results,'results':results,'notation':notation,'graphNetwork':graph_network,'problemNetwork':problem_network,'reductions':reductions,'sotaFrontier':frontier,'tightBounds':tight_bounds}
    compile_parameters(catalog, parameter_registry)
    compile_conditions(catalog, condition_registry)
    compile_graph_notation(catalog, json.loads((ROOT/'dist/data/graph-notation.json').read_text()))
    bundle = json.dumps(catalog, ensure_ascii=False, indent=2)
    (ROOT/'dist/data/catalog.json').write_text(bundle+'\n')
    # Keep the download readable, but avoid sending and parsing a second copy
    # of every source result in the browser. Both arrays share the same records.
    browser_catalog = {key: value for key, value in catalog.items() if key != 'sourceResults'}
    browser_bundle = json.dumps(browser_catalog, ensure_ascii=False, separators=(',', ':'))
    (ROOT/'dist/data/catalog.js').write_text(
        'window.ATLAS_DATA = '+browser_bundle.replace('<','\\u003c')+';\n'
        'window.ATLAS_DATA.sourceResults=window.ATLAS_DATA.results.filter(result=>result.verification!=="derived");\n'
    )
    print(f'Validated {len(source_results)} source results + {len(derived)} automatic consequences across {len(papers)} papers, {len(reductions["entries"])} reduction recipes, {len(sota_ids)} SOTA annotations ({sum(r["frontierStatus"] == "frontier" for r in source_results)} frontier points), {len(pairs)} certified comparisons, {len(tight_ids)} tightness certificates and {len(notation)} math expressions; wrote catalog.json and catalog.js.')

if __name__ == '__main__':
    build()
