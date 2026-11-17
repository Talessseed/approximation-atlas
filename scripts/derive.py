"""Derive catalog bounds from certified, reusable reduction recipes.

The engine knows no papers or result IDs. A recipe supplies exact instance
substitutions, a simulation cost and the supported problem/model/graph scopes.
It deliberately preserves symbolic expressions rather than simplifying Big-O
or optimizing an approximation parameter. Generated bounds retain their base
paper and every source assumption; they never inherit a SOTA judgement.
"""
from __future__ import annotations

from copy import deepcopy
import re
import unicodedata

_GREEK = {
    'Δ': r'\Delta', 'Γ': r'\Gamma', 'ε': r'\varepsilon',
    'δ': r'\delta', 'ρ': r'\rho', 'α': r'\alpha', 'β': r'\beta',
    'η': r'\eta', 'γ': r'\gamma', '∇': r'\nabla',
}
_KEY_ALIASES = {
    'Γd': r'\Gamma_d', 'Γₚ': r'\Gamma_p', 'Γp': r'\Gamma_p',
    'Γ_d': r'\Gamma_d', 'Γ_p': r'\Gamma_p',
    'Amax': r'A_{\max}', 'A_max': r'A_{\max}',
}
_TEXT_COMMANDS = {
    r'\text', r'\textrm', r'\textsf', r'\texttt', r'\textnormal',
    r'\mathrm', r'\operatorname', r'\mathsf', r'\mathtt',
}
_MODEL_TO_LOCAL = {'CONGEST', 'Anonymous'}
_STRIP_FIELDS = {
    'sota', 'sotaScopeTransfers', 'frontierComparisons', 'dominatedBy',
    'frontierStatus', 'relatedResults', 'problemParameter', 'problemParameterName',
    'problemSource', 'graphClassSource', 'roundParameters', 'approximationParameters', 'tightness', 'attribution',
    'algorithm', 'algorithmFamily', 'graphParameterRoles', 'proofSketch', 'proofFormula', 'provenanceNote', 'roundCountEvidence', 'constantApproximation', 'setting', 'parameterDefinitions', 'roundComplexityDetails',
}


def _group_end(tex, start):
    """Return the index following a balanced brace group, or its string end."""
    depth, pos = 0, start
    while pos < len(tex):
        if tex[pos] == '\\':
            match = re.match(r'\\(?:[A-Za-z]+|.)', tex[pos:])
            pos += len(match.group()) if match else 1
            continue
        if tex[pos] == '{':
            depth += 1
        elif tex[pos] == '}':
            depth -= 1
            if depth == 0:
                return pos + 1
        pos += 1
    return len(tex)


def expression_tex(expression, notation=None):
    """Convert recipe expressions to TeX without interpreting their algebra."""
    expression = str(expression)
    if notation and expression in notation:
        return notation[expression]
    if expression in _KEY_ALIASES:
        return _KEY_ALIASES[expression]
    result = expression
    for key, tex in _KEY_ALIASES.items():
        result = result.replace(key, tex)
    for key, tex in _GREEK.items():
        result = result.replace(key, tex)
    result = result.replace('−', '-').replace('·', r'\,')
    result = re.sub(r'(?<![A-Za-z\\])max\{([^{}]*)\}', r'\\max\\{\1\\}', result)
    return result


def _canonical_atom(tex):
    tex = re.sub(r'\s+', '', tex)
    # Subscript braces do not change a variable's identity.
    tex = re.sub(r'_\{([^{}]+)\}', r'_\1', tex)
    return tex


def _replacement_tex(tex):
    # Replacements are simultaneous. Parentheses preserve precedence even when
    # a source uses the parameter under a reciprocal, power or nonmonotone f.
    if re.fullmatch(r'[0-9]+|[A-Za-z]|\\[A-Za-z]+(?:_[A-Za-z0-9]+)?', tex):
        return tex
    return r'\left(' + tex + r'\right)'


def substitute_tex(tex, substitutions, notation=None):
    """Simultaneously substitute TeX variable atoms, preserving text commands.

    Controls such as \\log are single lexer tokens, not strings of variables;
    implicit products such as fk are two variable atoms. Gamma subscripts are
    matched as one atom. Contents of \\text/\\mathrm/\\operatorname stay literal.
    """
    replacements = {
        _canonical_atom(expression_tex(key, notation)):
        _replacement_tex(expression_tex(value, notation))
        for key, value in substitutions.items()
    }
    if not replacements:
        return tex
    out, pos = [], 0
    while pos < len(tex):
        start = pos
        if tex[pos] == '\\':
            match = re.match(r'\\(?:[A-Za-z]+|.)', tex[pos:])
            atom = match.group() if match else tex[pos]
            pos += len(atom)
            if atom in _TEXT_COMMANDS:
                gap = pos
                while gap < len(tex) and tex[gap].isspace():
                    gap += 1
                if gap < len(tex) and tex[gap] == '{':
                    pos = _group_end(tex, gap)
                    out.append(tex[start:pos])
                    continue
        elif tex[pos].isalpha():
            atom = tex[pos]
            pos += 1
        else:
            out.append(tex[pos])
            pos += 1
            continue
        base_end = pos
        script_start = pos
        while script_start < len(tex) and tex[script_start].isspace():
            script_start += 1
        script_end = None
        if script_start < len(tex) and tex[script_start] == '_':
            script_value = script_start + 1
            while script_value < len(tex) and tex[script_value].isspace():
                script_value += 1
            if script_value < len(tex):
                if tex[script_value] == '{':
                    script_end = _group_end(tex, script_value)
                elif tex[script_value] == '\\':
                    match = re.match(r'\\(?:[A-Za-z]+|.)', tex[script_value:])
                    script_end = script_value + (len(match.group()) if match else 1)
                else:
                    script_end = script_value + 1
        full_end = script_end or base_end
        full_atom = tex[start:full_end]
        # The f naming an unspecified running-time function is not the set
        # frequency/capacity variable f. Its arguments can still be substituted.
        tail = tex[full_end:].lstrip()
        function_f = atom == 'f' and (tail.startswith('(') or tail.startswith(r'\bigl(') or tail.startswith(r'\left('))
        replacement = replacements.get(_canonical_atom(full_atom))
        if replacement is not None and not function_f:
            out.append(replacement)
            pos = full_end
        else:
            out.append(atom)
            if script_end:
                out.append(tex[base_end:script_start + 1])
                out.append(substitute_tex(tex[script_start + 1:script_end], substitutions, notation))
                pos = script_end
    return ''.join(out)


def _plain_substitute(label, substitutions):
    """Readable fallback labels; the TeX expression remains authoritative."""
    if not substitutions:
        return label
    aliases = dict(substitutions)
    for char in label:
        canonical = unicodedata.normalize('NFKC', char)
        if canonical in substitutions and len(canonical) == 1:
            aliases.setdefault(char, substitutions[canonical])
    if 'Γp' in aliases:
        aliases.setdefault('Γₚ', aliases['Γp'])
    if 'Γₚ' in aliases:
        aliases.setdefault('Γp', aliases['Γₚ'])
    keys = sorted(aliases, key=len, reverse=True)
    out, pos = [], 0
    single = {key for key in keys if len(key) == 1 and key.isascii()}
    while pos < len(label):
        match_key = next((key for key in keys if label.startswith(key, pos)), None)
        if match_key:
            if match_key.isascii() and match_key.isalpha():
                start, end = pos, pos + len(match_key)
                while start and label[start - 1].isascii() and label[start - 1].isalpha():
                    start -= 1
                while end < len(label) and label[end].isascii() and label[end].isalpha():
                    end += 1
                word = label[start:end]
                if word != match_key and not all(char in single for char in word):
                    match_key = None
                elif match_key == 'f' and label[pos + 1:].lstrip().startswith('('):
                    match_key = None
        if match_key:
            value = str(aliases[match_key])
            out.append(value if re.fullmatch(r'\d+|[A-Za-zΔΓερδ]', value) else '(' + value + ')')
            pos += len(match_key)
        else:
            out.append(label[pos])
            pos += 1
    return ''.join(out)


def _math(record, notation, field):
    generated = record.get('derivedMath', {})
    if field in generated:
        return generated[field]
    label = record.get(field + 'Display', record[field])
    return notation.get(label, notation.get(record[field]))


def _parameter_substitution(current, substitutions, notation, field):
    """Instantiate named f(parameter) bounds using their semantic labels.

    A name such as "maximum degree" lives inside a protected text group. Its
    roundParameters entry explicitly identifies it as Delta, so it may be
    replaced without ever rewriting arbitrary prose or function names.
    """
    tex = _math(current, notation, field)
    label = current.get(field+'Display', current[field])
    parameters = current.get('roundParameters' if field=='rounds' else 'approximationParameters')
    if not parameters or not substitutions:
        return (_plain_substitute(label, substitutions),
                substitute_tex(tex, substitutions, notation))
    canon = {_canonical_atom(expression_tex(key, notation)): value
             for key, value in substitutions.items()}
    arguments_tex, arguments_label = [], []
    for parameter in parameters:
        symbol, name = parameter['symbol'], parameter['name']
        value = canon.get(_canonical_atom(expression_tex(symbol, notation)))
        if value is not None:
            arguments_tex.append(expression_tex(value, notation))
            arguments_label.append(str(value))
        elif parameter.get('displaySymbol') or parameter.get('introduced'):
            arguments_tex.append(expression_tex(symbol, notation))
            arguments_label.append(symbol)
        else:
            arguments_tex.append(r'\text{' + name + '}')
            arguments_label.append(name)
    function = 'F' if label.startswith('F(') else 'f'
    return (function+'(' + ', '.join(arguments_label) + ')',
            function+r'\bigl(' + ','.join(arguments_tex) + r'\bigr)')


def _register(notation, label, tex):
    """Keep existing notation entries immutable in the unlikely label collision."""
    if label in notation and notation[label] != tex:
        label += ' [derived]'
        suffix = 2
        while label in notation and notation[label] != tex:
            label = label.rsplit(' [derived', 1)[0] + f' [derived {suffix}]'
            suffix += 1
    notation[label] = tex
    return label


def _cost(cost, label, tex):
    if cost == 'T':
        return label, tex
    exact = re.fullmatch(r'(\d+)(?:\s+rounds?)?', label.strip())
    if cost == 'T+4' and exact:
        budget = str(int(exact[1]) + 4)
        return budget, budget
    # A certified numerical upper bound is a relation, not an arithmetic
    # operand. Transform its budget and retain the relation outside the result.
    upper = re.fullmatch(r'≤\s*(\d+)', label.strip())
    if upper:
        budget = int(upper[1])
        if cost in {'2T', 'T+1', 'T+4'}:
            transformed = 2 * budget if cost == '2T' else budget + (4 if cost == 'T+4' else 1)
            return '≤ ' + str(transformed), r'\le ' + str(transformed)
        if cost in {'O(T)', 'O(T+1)'}:
            label = tex = str(budget)
    if cost == '2T':
        return '2 · (' + label + ')', r'2\cdot\bigl(' + tex + r'\bigr)'
    if cost in {'T+1', 'T+4'}:
        extra = '4' if cost == 'T+4' else '1'
        return '(' + label + ') + ' + extra, r'\bigl(' + tex + r'\bigr)+' + extra
    if cost == 'O(T)':
        return 'O(' + label + ')', r'O\!\left(' + tex + r'\right)'
    if cost == 'O(T+1)':
        return 'O((' + label + ') + 1)', r'O\!\left(\bigl(' + tex + r'\bigr)+1\right)'
    raise ValueError('Unsupported reduction cost: ' + str(cost))


def _scope(record, field):
    scope = record.get(field, {})
    return scope if isinstance(scope, dict) else {'node': scope}


def _admissible(record):
    return (record.get('verification') == 'primary'
            and not record.get('caveat')
            and str(record.get('status', '')).casefold() not in {'claimed', 'unverified', 'withdrawn', 'retracted'})


def _source_math(base, notation):
    return {
        'rounds': base['rounds'],
        'roundsDisplay': base.get('roundsDisplay', base['rounds']),
        'roundsTex': notation.get(base['rounds']),
        'roundsDisplayTex': _math(base, notation, 'rounds'),
        'approximation': base['approximation'],
        'approximationDisplay': base.get('approximationDisplay', base['approximation']),
        'approximationTex': notation.get(base['approximation']),
        'approximationDisplayTex': _math(base, notation, 'approximation'),
        'approximationBenchmark': base.get('approximationBenchmark'),
    }


def _benchmark(record, problems):
    explicit = record.get('approximationBenchmark')
    if explicit is not None:
        return explicit
    problem = problems.get(_scope(record, 'problemScope').get('node'), {})
    return 'integral' if problem.get('outputKind', '').startswith('integral-') else None


def _source_guards(record, guards, problems):
    if not isinstance(guards, dict) or set(guards) - {'objective', 'weightCondition', 'outputKind', 'benchmarks'}:
        return False
    problem = problems.get(_scope(record, 'problemScope').get('node'), {})
    return (('objective' not in guards or record.get('objective') == guards['objective'])
            and ('weightCondition' not in guards or record.get('weightCondition') == guards['weightCondition'])
            and ('outputKind' not in guards or problem.get('outputKind') == guards['outputKind'])
            and ('benchmarks' not in guards or _benchmark(record, problems) in guards['benchmarks']))


def _graph_path(source, target, edges):
    queue, seen = [({'nodes': [source], 'edges': []})], {source}
    ordered = sorted(edges, key=lambda e: (e['subset'], e['superset']))
    while queue:
        path = queue.pop(0)
        if path['nodes'][-1] == target:
            return path
        for edge in ordered:
            if edge['subset'] == path['nodes'][-1] and edge['superset'] not in seen:
                seen.add(edge['superset'])
                queue.append({'nodes': [*path['nodes'], edge['superset']],
                              'edges': [*path['edges'], edge]})
    return None


def _multiplier(engine, recipe, graph, graph_edges):
    specification = engine.get('multiplier', {})
    default = specification.get('default')
    if not isinstance(default, dict) or not all(isinstance(default.get(k), str) and default[k] for k in ('label', 'tex')):
        return None
    applicable = []
    for bound in specification.get('graphBounds', []):
        path = _graph_path(graph, bound['graph'], graph_edges)
        if path:
            applicable.append((bound, path))
    # A more specific certified family takes precedence over a containing
    # family, even when a redundant inclusion gives the latter a short path.
    specific = [item for item in applicable if not any(
        other[0]['graph'] != item[0]['graph']
        and _graph_path(other[0]['graph'], item[0]['graph'], graph_edges)
        and not _graph_path(item[0]['graph'], other[0]['graph'], graph_edges)
        for other in applicable)]
    choice, path = (min(specific, key=lambda item: (len(item[1]['edges']), item[0]['graph']))
                    if specific else (default, {'nodes': [graph], 'edges': []}))
    selected = {key: deepcopy(choice[key]) for key in ('label', 'tex', 'graph') if key in choice}
    certificate = {'source': deepcopy(recipe.get('source', {})),
                   'graphPath': deepcopy(path), 'bound': deepcopy(choice)}
    return selected, certificate


def _transfer(current, base, recipe, engine, notation, problems, graphs, graph_edges, reverse=False):
    """Return one certified consequence, or None for an unsupported instance."""
    source_node = _scope(current, 'problemScope').get('node')
    graph_node = _scope(current, 'graphScope').get('node')
    if not _source_guards(current, engine.get('sourceGuards', {}), problems):
        return None
    # Instance-domain facts belong to the physical graph. A graph-changing
    # simulation needs its own certificate to map them, which is not inferred.
    if current.get('inputConditions') and engine.get('graphMap') != 'same':
        return None
    if reverse:
        if not engine.get('lower') or current.get('bound') != 'lower':
            return None
        if engine.get('cost') != 'T' or engine.get('factor') != 'identity' or engine.get('graphMap') != 'same':
            return None
        if engine.get('targetInputConditions'):
            return None
        if source_node != recipe['from']:
            return None
        target_problem = recipe['to']
        target_graph = graph_node
    else:
        if not engine.get('upper') or current.get('bound') != 'upper':
            return None
        scopes = engine.get('sourceScopes', [recipe['to']])
        if source_node not in scopes:
            return None
        target_problem = recipe['from']
        graph_map = engine.get('graphMap')
        if graph_map == 'same':
            target_graph = graph_node
        elif isinstance(graph_map, dict):
            target_graph = graph_map.get(graph_node)
        else:
            return None
    if target_problem not in problems or target_graph not in graphs:
        return None
    if engine.get('factor') in {'double', 'multiply'} and current.get('objective') != 'min':
        return None
    model = current.get('model')
    conversion = None
    if model not in recipe.get('models', []):
        if not reverse and model in _MODEL_TO_LOCAL and 'LOCAL' in recipe.get('models', []):
            conversion = f'The source {model} algorithm is simulated in LOCAL; this reduction claims the resulting LOCAL bound only.'
            model = 'LOCAL'
        else:
            return None
    if engine.get('mode') not in {'identity', 'simulation', 'rounding', 'parameters'}:
        return None
    substitutions = {} if reverse else engine.get('substitutions', {})
    round_tex = _math(current, notation, 'rounds')
    approx_tex = _math(current, notation, 'approximation')
    if not isinstance(round_tex, str) or not isinstance(approx_tex, str):
        return None
    # A single T certificate cannot compose separate metrics such as total
    # rounds and awake rounds. Identity transfer can retain them verbatim.
    if not reverse and engine.get('cost') != 'T' and re.search(r'(?<!\\);', round_tex):
        return None
    round_label, round_tex = _parameter_substitution(current, substitutions, notation, 'rounds')
    approx_label, approx_tex = _parameter_substitution(current, substitutions, notation, 'approximation')
    multiplier = multiplier_certificate = None
    if not reverse:
        round_label, round_tex = _cost(engine.get('cost', 'T'), round_label, round_tex)
        if engine.get('factor') == 'double':
            approx_label = '2 · (' + approx_label + ')'
            approx_tex = r'2\cdot\bigl(' + approx_tex + r'\bigr)'
        elif engine.get('factor') == 'multiply':
            chosen = _multiplier(engine, recipe, graph_node, graph_edges)
            if chosen is None:
                return None
            multiplier, multiplier_certificate = chosen
            numeric = re.fullmatch(r'\d+(?:\.\d+)?', multiplier['label'])
            left_label = multiplier['label'] if numeric else '(' + multiplier['label'] + ')'
            left_tex = multiplier['tex'] if numeric else r'\bigl(' + multiplier['tex'] + r'\bigr)'
            approx_label = left_label + ' · (' + approx_label + ')'
            approx_tex = left_tex + r'\cdot\bigl(' + approx_tex + r'\bigr)'
        elif engine.get('factor') != 'identity':
            return None
    path = [recipe['id'], *current.get('reductionPath', [])]
    derived = {key: deepcopy(value) for key, value in current.items()
               if key not in _STRIP_FIELDS and not key.startswith('_')
               and not key.casefold().startswith('sota')}
    derived['id'] = 'derived-' + base['id'] + '--' + '--'.join(path)
    derived['problem'] = problems[target_problem]['label']
    derived['problemScope'] = {'node': target_problem}
    derived['graphScope'] = (deepcopy(_scope(current, 'graphScope'))
                             if target_graph == graph_node else {'node': target_graph})
    derived['graphClass'] = (current['graphClass'] if target_graph == graph_node
                             else graphs[target_graph]['label'])
    derived['model'] = model
    if not reverse and engine.get('targetBenchmark'):
        derived['approximationBenchmark'] = engine['targetBenchmark']
    input_conditions = list(dict.fromkeys([*current.get('inputConditions', []),
        *(engine.get('targetInputConditions', []) if not reverse else [])]))
    if input_conditions:
        derived['inputConditions'] = input_conditions
    if engine.get('targetVariant') == 'Unweighted' and not reverse:
        derived['variant'] = 'Unweighted'
        derived['weightCondition'] = 'weights-unweighted'
    elif engine.get('targetVariant') != 'preserve':
        return None
    elif engine.get('mode') == 'parameters' and not reverse:
        # The source parameterized-problem name is provenance, not a new
        # parameter of ordinary matching. Weight support stays in assumptions.
        derived['variant'] = 'Unit-capacity specialization; source algorithm: ' + base['variant']
    elif not current.get('sourceVariant'):
        derived['variant'] = 'Source algorithm: ' + base['variant']
    derived['sourceVariant'] = base['variant']
    derived['verification'] = 'derived'
    derived['sourceVerification'] = base['verification']
    derived['sourceResultId'] = base['id']
    derived['parentResultId'] = current['id']
    derived['sourceProblem'] = base['problem']
    derived['sourceGraphClass'] = base['graphClass']
    derived['sourceMath'] = _source_math(base, notation)
    derived['reductionPath'] = path
    derived['reductionDirection'] = 'lower' if reverse else 'upper'
    derived['reductionSteps'] = [{
        'id': recipe['id'], 'title': recipe['title'],
        'inputResultId': current['id'],
        'outputProblem': target_problem, 'outputGraph': target_graph,
        'from': target_problem if not reverse else source_node,
        'to': source_node if not reverse else target_problem,
        'direction': 'lower' if reverse else 'upper',
        'substitutions': deepcopy(substitutions),
        'cost': 'T' if reverse else engine['cost'],
        'factor': 'identity' if reverse else engine['factor'],
        'conditions': deepcopy(recipe.get('conditions', [])),
        'assumptions': deepcopy(engine.get('assumptions', [])),
        'source': deepcopy(recipe.get('source', {})),
        'modelConversion': conversion,
    }, *current.get('reductionSteps', [])]
    if multiplier is not None:
        derived['reductionSteps'][0]['multiplier'] = multiplier
        derived['reductionSteps'][0]['multiplierCertificate'] = multiplier_certificate
    if not reverse and engine.get('targetBenchmark'):
        derived['reductionSteps'][0]['targetBenchmark'] = engine['targetBenchmark']
    if not reverse and engine.get('targetInputConditions'):
        derived['reductionSteps'][0]['targetInputConditions'] = deepcopy(engine['targetInputConditions'])
    derived['derivedMath'] = {'rounds': round_tex, 'approximation': approx_tex}
    derived['rounds'] = derived['roundsDisplay'] = _register(notation, round_label, round_tex)
    derived['approximation'] = derived['approximationDisplay'] = _register(notation, approx_label, approx_tex)
    if current.get('roundComplexityDetails'):
        detail = deepcopy(current['roundComplexityDetails'])
        if detail['status'] in {'explicit', 'partial', 'impossibility'}:
            expanded = deepcopy(current)
            expression = detail.get('expression', detail)
            expanded['roundsDisplay'] = expression['formula']
            expanded.setdefault('derivedMath', {})['rounds'] = expression['tex']
            expanded.pop('roundParameters', None)
            full_label, full_tex = _parameter_substitution(expanded, substitutions, notation, 'rounds')
            if not reverse:
                full_label, full_tex = _cost(engine.get('cost', 'T'), full_label, full_tex)
            if 'expression' in detail:
                detail['expression'] = {'formula':full_label, 'tex':full_tex}
                # Definitions and domain restrictions undergo substitutions,
                # but are not arithmetic operands of the simulation cost.
                expanded['roundsDisplay'] = detail['suffix']['formula']
                expanded['derivedMath']['rounds'] = detail['suffix']['tex']
                suffix_label, suffix_tex = _parameter_substitution(expanded, substitutions, notation, 'rounds')
                detail['suffix'] = {'formula':suffix_label, 'tex':suffix_tex}
                full_label += suffix_label
                full_tex += suffix_tex
            detail['formula'] = _register(notation, full_label, full_tex)
            detail['tex'] = full_tex
        else:
            detail['formula'], detail['tex'] = derived['roundsDisplay'], derived['derivedMath']['rounds']
        detail['sourceBasis'] = detail.get('sourceBasis', detail['basis'])
        detail['basis'] = 'reduction'
        detail['derivedFrom'] = current['id']
        detail['explanation'] += (' ' if detail['explanation'] else '') + 'The atlas applies the exact instance substitutions and communication cost of the reduction: ' + recipe['title'] + '.'
        detail['evidence'].append({'url':recipe['source']['url'], 'title':recipe['source']['title'], 'location':recipe['source']['location']})
        derived['roundComplexityDetails'] = detail
    derived['frontierStatus'] = 'unreviewed'
    # These are explicit paragraphs, not a rewritten paraphrase of the source.
    original = 'Source result (' + base['id'] + '), evaluated on its transformed instance: '
    parameter_paragraphs = [original + base['parameters'],
        'Symbols not instantiated by a reduction retain their source meaning on the transformed input instance; they are not silently identified with parameters of the resulting physical graph.']
    assumption_paragraphs = [original + base['assumptions']]
    for step in derived['reductionSteps']:
        mapping = ', '.join(f'{key}={value}' for key, value in step['substitutions'].items())
        if mapping:
            parameter_paragraphs.append(step['title'] + ': exact instance substitutions ' + mapping + '.')
        assumption_paragraphs.append(step['title'] + ': ' + ' '.join(step['conditions'] + step['assumptions']))
        if step.get('modelConversion'):
            assumption_paragraphs.append(step['modelConversion'])
    derived['parameters'] = '\n\n'.join(parameter_paragraphs)
    derived['assumptions'] = '\n\n'.join(assumption_paragraphs)
    derived['summary'] = ('Derived ' + ('lower bound' if reverse else 'upper bound') + ' via '
                          + ' → '.join(step['title'] for step in derived['reductionSteps'])
                          + '. Original source: ' + base['summary'])
    derived['theorem'] = base['theorem'] + '; derived via ' + ' → '.join(path)
    return derived


def derive_results(results, notation, problem_network, graph_network, reduction_data):
    """Return all compatible consequences along acyclic problem-node paths.

    ``results`` are canonical base records with graphScope/problemScope and
    named display bounds. ``notation`` is extended in place. Every output keeps
    the base paper ID, URL, year, randomness and objective. Rules must contain
    an explicit engine certificate; descriptive relation arrows do not suffice.
    """
    problems = {node['id']: node for node in problem_network['nodes']}
    graphs = {node['id']: node for node in graph_network['nodes']}
    recipes = [recipe for recipe in reduction_data.get('entries', [])
               if isinstance(recipe.get('engine'), dict)]
    derived, seen = [], set()
    for base in results:
        if not _admissible(base) or base.get('bound') not in {'upper', 'lower'}:
            continue
        start = _scope(base, 'problemScope').get('node')
        frontier = [(base, (start,))]
        while frontier:
            current, visited = frontier.pop(0)
            if len(current.get('reductionPath', [])) >= len(problems) - 1:
                continue
            reverse = current['bound'] == 'lower'
            for recipe in recipes:
                target = recipe['to'] if reverse else recipe['from']
                if target in visited:
                    continue
                candidate = _transfer(current, base, recipe, recipe['engine'], notation,
                                      problems, graphs, graph_network['edges'], reverse=reverse)
                if candidate is None or candidate['id'] in seen:
                    continue
                seen.add(candidate['id'])
                derived.append(candidate)
                frontier.append((candidate, (*visited, target)))
    return derived
