"""Regression tests for paper-independent, typed reduction compilation."""
from copy import deepcopy
from contextlib import redirect_stdout
from io import StringIO
import json
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory
import unittest

import build as build_module
from derive import derive_results, substitute_tex
from parameters import compile_parameters


DATA = Path(__file__).resolve().parents[1] / 'dist' / 'data'


def read_data(name):
    return json.loads((DATA / name).read_text())


class DerivationTests(unittest.TestCase):
    def setUp(self):
        self.problems = read_data('problems.json')
        self.graphs = read_data('graph-classes.json')
        self.rules = read_data('reductions.json')
        self.notation = read_data('notation.json')
        self.notation.update({
            'F(n, Δ, Γd, Γp, Amax, ε)': r'F(n,\Delta,\Gamma_d,\Gamma_p,A_{\max},\varepsilon)',
            'F(n, Δ)': r'F(n,\Delta)',
            '1 + ε': r'1+\varepsilon',
        })

    def source(self, problem='covering-lp', graph='incidence', **changes):
        """An unpublished article fixture with no production result/paper ID."""
        problems = {node['id']: node for node in self.problems['nodes']}
        graphs = {node['id']: node for node in self.graphs['nodes']}
        source = {
            'id': 'future-article-completely-new-result',
            'paperId': 'future-article-not-in-the-catalog',
            'sourceUrl': 'https://example.org/manually-linked-new-article',
            'year': 2026,
            'problem': problems[problem]['label'],
            'problemScope': {'node': problem},
            'graphClass': graphs[graph]['label'],
            'graphScope': {'node': graph},
            'variant': 'Fractional; normalized positive coefficients',
            'objective': 'min',
            'model': 'CONGEST',
            'randomization': 'Deterministic',
            'bound': 'upper',
            'approximation': '1 + ε',
            'rounds': 'F(n, Δ, Γd, Γp, Amax, ε)',
            'roundClass': 'other',
            'parameters': 'Accuracy ε; n processors; degree Δ; row/column bounds Γd, Γp; coefficient bound Amax.',
            'assumptions': 'The source supplies normalized coefficients and all global parameters; its bit-precision assumptions apply.',
            'theorem': 'Theorem X, supplied by a future curator',
            'summary': 'A hypothetical covering-LP theorem whose runtime need not be monotone.',
            'verification': 'primary',
            'sota': {'setting': 'Source-only manual annotation'},
            'frontierStatus': 'sota',
            'sotaScopeTransfers': ['source-only'],
            'frontierComparisons': [{'sourceOnly': True}],
            'tightness': [{'certificateId':'source-only-matching-bound'}],
        }
        source.update(changes)
        return source

    def derive(self, *sources, rules=None):
        return derive_results(list(sources), self.notation, self.problems,
                              self.graphs, self.rules if rules is None else rules)

    def domination_recipe(self, converse=False):
        """An explicit future certificate, independent of production paper IDs."""
        rule = deepcopy(next(rule for rule in self.rules['entries'] if rule['id'] == 'mds-to-local-covering'))
        rule.update(id='future-cds-comparison' if converse else 'future-cds-connector',
                    title='Future certified domination transformation',
                    **{'from':'dominating-set' if converse else 'connected-dominating-set',
                       'to':'connected-dominating-set' if converse else 'dominating-set'})
        rule['source'] = {'url':'https://example.org/future-connector', 'title':'Future connector certificate', 'location':'Proof X'}
        rule['parameterDefinitions'] = [] if converse else [
            {'symbol':'∇₁', 'description':'Depth-one minor density of the input graph',
             'tex':r'\nabla_1', 'sourceSymbol':'old-density'}]
        rule['engine'] = {
            'mode':'identity' if converse else 'rounding',
            'sourceScopes':[rule['to']], 'graphMap':'same', 'substitutions':{},
            'cost':'T' if converse else 'T+4', 'factor':'multiply',
            'multiplier':{'default':{'label':'3', 'tex':'3'} if converse else
                {'label':'1+2∇₁', 'tex':r'1+2\nabla_1'},
                'graphBounds':[] if converse else [
                    {'graph':'planar', 'label':'7', 'tex':'7'},
                    {'graph':'pseudoforest', 'label':'3', 'tex':'3'},
                    {'graph':'forest', 'label':'3', 'tex':'3'}]},
            'sourceGuards':{'objective':'min', 'weightCondition':'weights-unweighted',
                            'outputKind':'integral-vertex-set',
                            'benchmarks':['integral'] if converse else ['integral','fractional']},
            'targetVariant':'Unweighted', 'targetBenchmark':'integral',
            'targetInputConditions':['input-connected'], 'upper':True, 'lower':False,
        }
        return rule

    def domination_source(self, converse=False, **changes):
        return self.source(problem='connected-dominating-set' if converse else 'dominating-set',
                           graph='general', variant='Unweighted', weightCondition='weights-unweighted',
                           model='LOCAL', rounds='F(n, Δ)', **changes)

    @staticmethod
    def at_problem(results, node):
        return [result for result in results if result['problemScope']['node'] == node]

    def one_at_problem(self, results, node):
        matches = self.at_problem(results, node)
        self.assertEqual(len(matches), 1, (node, [result['id'] for result in matches]))
        return matches[0]

    def test_new_covering_lp_article_generates_fractional_and_rounded_chain(self):
        source = self.source()
        original = deepcopy(source)
        results = self.derive(source)
        fractional_domination = self.one_at_problem(results, 'fractional-dominating-set')
        fractional_cover = self.one_at_problem(results, 'fractional-vertex-cover')
        cover = self.one_at_problem(results, 'vertex-cover')
        self.assertEqual(fractional_domination['graphScope']['node'], 'general')
        self.assertEqual(fractional_cover['graphScope']['node'], 'general')
        self.assertEqual(cover['graphScope']['node'], 'general')
        self.assertEqual(cover['reductionPath'], [
            'vertex-cover-to-fractional-cover-rounding',
            'fractional-vertex-cover-to-covering-lp',
        ])
        self.assertEqual(cover['parentResultId'], fractional_cover['id'])
        self.assertEqual(cover['reductionSteps'][0]['inputResultId'], fractional_cover['id'])
        self.assertEqual(cover['reductionSteps'][0]['outputProblem'], 'vertex-cover')
        self.assertEqual(fractional_cover['parentResultId'], source['id'])
        self.assertEqual(fractional_domination['derivedMath']['approximation'], r'1+\varepsilon')
        self.assertEqual(fractional_cover['derivedMath']['approximation'], r'1+\varepsilon')
        self.assertEqual(cover['derivedMath']['approximation'], r'2\cdot\bigl(1+\varepsilon\bigr)')
        self.assertEqual(cover['derivedMath']['rounds'], fractional_cover['derivedMath']['rounds'],
                         'local threshold rounding adds no communication round')
        self.assertEqual(source, original, 'the new article statement remains immutable')

    def test_future_audited_numeric_upper_bound_survives_costs_and_composed_rounding(self):
        self.notation.update({'O(1)': 'O(1)', '≤ 6': r'\le 6'})
        audited = {
            'rounds': 'O(1)', 'roundsDisplay': '≤ 6', 'roundClass': 'constant',
            'roundCountEvidence': {
                'rounds': '≤ 6', 'basis': 'phase-count', 'checked': '2026-11-16',
                'explanation': 'A future source proves an upper bound of six communication rounds.',
                'evidence': [{'url': 'https://example.org/future-round-count',
                              'title': 'Future source', 'location': 'Theorem X'}],
            },
        }
        source = self.source(**audited)
        original = deepcopy(source)
        results = self.derive(source)
        domination = self.one_at_problem(results, 'fractional-dominating-set')
        fractional_cover = self.one_at_problem(results, 'fractional-vertex-cover')
        cover = self.one_at_problem(results, 'vertex-cover')
        self.assertEqual(domination['roundsDisplay'], '≤ 12', 'the incidence simulation doubles the budget')
        self.assertEqual(domination['derivedMath']['rounds'], r'\le 12')
        self.assertEqual(fractional_cover['roundsDisplay'], '≤ 7', 'edge-host setup adds one to the budget')
        self.assertEqual(fractional_cover['derivedMath']['rounds'], r'\le 7')
        self.assertEqual(cover['parentResultId'], fractional_cover['id'])
        self.assertEqual(cover['roundsDisplay'], '≤ 7', 'identity rounding preserves the composed inequality')
        self.assertEqual(cover['derivedMath']['rounds'], r'\le 7')
        self.assertEqual(len(cover['reductionPath']), 2)
        for result in results:
            self.assertNotIn('roundCountEvidence', result, 'the source count certificate is not a certificate for the transformed runtime')
            self.assertEqual(result['sourceMath']['rounds'], 'O(1)')
            self.assertEqual(result['sourceMath']['roundsDisplay'], '≤ 6')
            self.assertEqual(result['sourceMath']['roundsDisplayTex'], r'\le 6')
        self.assertEqual(source, original, 'source evidence and source runtime are immutable')

        # The existing incidence simulation for fractional matching has an
        # asymptotic setup cost. Its Big-O applies to the numerical operand,
        # never to a relation such as (≤6)+1.
        packing = self.source(problem='packing-lp', objective='max', **audited)
        matching = self.one_at_problem(self.derive(packing), 'fractional-matching')
        self.assertEqual(matching['roundsDisplay'], 'O((6) + 1)')
        self.assertEqual(matching['derivedMath']['rounds'], r'O\!\left(\bigl(6\bigr)+1\right)')
        self.assertNotIn('≤', matching['roundsDisplay'])
        self.assertNotRegex(matching['derivedMath']['rounds'], r'\\le(?:q)?\b')
        rules = deepcopy(self.rules)
        future_rule = next(entry for entry in rules['entries'] if entry['id']=='fractional-matching-to-packing-lp')
        future_rule['engine']['cost'] = 'O(T)'
        matching = self.one_at_problem(self.derive(packing, rules=rules), 'fractional-matching')
        self.assertEqual(matching['roundsDisplay'], 'O(6)')
        self.assertEqual(matching['derivedMath']['rounds'], r'O\!\left(6\right)')

    def test_fractional_lp_never_becomes_integral_domination_without_a_rounding_rule(self):
        results = self.derive(self.source())
        self.assertFalse(self.at_problem(results, 'dominating-set'))
        self.assertFalse(self.at_problem(results, 'total-dominating-set'))
        self.assertFalse(self.at_problem(results, 'client-dominating-set'))
        self.assertFalse(any('mds-to-fractional-domination' in result['reductionPath'] for result in results))

    def test_planar_incidence_solver_preserves_only_certified_transformations(self):
        results = self.derive(self.source(graph='planar-incidence'))
        self.assertFalse(self.at_problem(results, 'fractional-dominating-set'),
                         'closed-neighborhood incidence does not preserve planarity')
        self.assertFalse(self.at_problem(results, 'dominating-set'))
        for node in ('fractional-vertex-cover', 'vertex-cover'):
            self.assertEqual(self.one_at_problem(results, node)['graphScope']['node'], 'planar',
                             'edge subdivision preserves planarity')

    def test_exact_instance_size_and_degree_are_substituted_in_opaque_runtime(self):
        results = self.derive(self.source())
        cover = self.one_at_problem(results, 'fractional-vertex-cover')
        tex = cover['derivedMath']['rounds']
        self.assertIn(r'F(\left(n+m\right),\left(\max\{\Delta,2\}\right),2,\Delta,1,\varepsilon)', tex)
        self.assertTrue(tex.endswith(r'\bigr)+1'), 'edge-host setup round is retained')
        self.assertNotIn('n+n', tex, 'a size upper bound cannot be passed through an arbitrary F')
        self.assertNotIn(r'\Delta/2', tex)
        domination = self.one_at_problem(results, 'fractional-dominating-set')
        self.assertIn(r'2\cdot\bigl(F(\left(2n\right),', domination['derivedMath']['rounds'])
        self.assertEqual(cover['reductionSteps'][0]['substitutions']['n'], 'n+m')

    def test_future_edge_count_runtime_uses_the_exact_transformed_number_of_edges(self):
        self.notation['F(m)'] = r'F(m)'
        cases = (
            ('set-cover', 'incidence', 'min', 'dominating-set', 'n+2m'),
            ('covering-lp', 'incidence', 'min', 'fractional-dominating-set', 'n+2m'),
            ('set-cover', 'incidence', 'min', 'vertex-cover', '2m'),
            ('covering-lp', 'incidence', 'min', 'fractional-vertex-cover', '2m'),
            ('packing-lp', 'incidence', 'max', 'fractional-matching', '2m'),
            ('dominating-set', 'general', 'min', 'edge-dominating-set', 'm_L'),
        )
        for problem, graph, objective, target, exact_edges in cases:
            with self.subTest(problem=problem, target=target):
                source = self.source(problem=problem, graph=graph, objective=objective,
                                     model='LOCAL', rounds='F(m)')
                result = self.one_at_problem(self.derive(source), target)
                self.assertEqual(result['reductionSteps'][0]['substitutions']['m'], exact_edges)
                self.assertIn(r'F(\left(' + exact_edges + r'\right))', result['derivedMath']['rounds'])
                self.assertNotIn('F(m)', result['derivedMath']['rounds'],
                                 'a source edge-count argument is not mistaken for the physical graph edge count')
                self.assertEqual(result['sourceMath']['roundsTex'], r'F(m)')
                if target == 'edge-dominating-set':
                    self.assertIn('m_L', result['assumptions'])
                    self.assertRegex(result['assumptions'], r'(?:sum|Σ|∑)',
                                     'the exact line-graph edge-count parameter has a retained definition')

    def test_instance_vertex_and_edge_count_substitutions_are_simultaneous(self):
        self.notation['F(n, m)'] = r'F(n,m)'
        cases = (
            ('set-cover', 'incidence', 'min', 'dominating-set', r'F(\left(2n\right),\left(n+2m\right))'),
            ('covering-lp', 'incidence', 'min', 'fractional-dominating-set', r'F(\left(2n\right),\left(n+2m\right))'),
            ('set-cover', 'incidence', 'min', 'vertex-cover', r'F(\left(n+m\right),\left(2m\right))'),
            ('covering-lp', 'incidence', 'min', 'fractional-vertex-cover', r'F(\left(n+m\right),\left(2m\right))'),
            ('packing-lp', 'incidence', 'max', 'fractional-matching', r'F(\left(n+m\right),\left(2m\right))'),
            ('dominating-set', 'general', 'min', 'edge-dominating-set', r'F(m,\left(m_L\right))'),
        )
        for problem, graph, objective, target, expected in cases:
            with self.subTest(problem=problem, target=target):
                source = self.source(problem=problem, graph=graph, objective=objective,
                                     model='LOCAL', rounds='F(n, m)')
                result = self.one_at_problem(self.derive(source), target)
                self.assertIn(expected, result['derivedMath']['rounds'],
                              'replacement expressions use the original physical n and m, without recursive substitution')

    def test_line_graph_transfer_retains_exact_degree_and_claims_local_only(self):
        source = self.source(problem='dominating-set', graph='general',
                             variant='Unweighted', model='LOCAL', rounds='F(n, Δ)')
        edge = self.one_at_problem(self.derive(source), 'edge-dominating-set')
        tex = edge['derivedMath']['rounds']
        self.assertIn(r'F(m,\Delta_L)', tex)
        self.assertNotIn('2', tex, 'the upper bound 2Δ−2 is not substituted into an arbitrary F')
        self.assertEqual(edge['model'], 'LOCAL')
        self.assertIn('exact maximum degree', edge['assumptions'])
        # A CONGEST algorithm can be run in LOCAL, but the reverse simulation
        # through a line graph supplies no CONGEST bandwidth guarantee.
        source['model'] = 'CONGEST'
        edge = self.one_at_problem(self.derive(source), 'edge-dominating-set')
        self.assertEqual(edge['model'], 'LOCAL')
        self.assertIn('source CONGEST algorithm is simulated in LOCAL', edge['assumptions'])

    def test_named_runtime_parameter_is_instantiated_using_its_semantic_symbol(self):
        self.notation['f(maximum degree)'] = r'f\bigl(\text{maximum degree}\bigr)'
        source = self.source(problem='dominating-set', graph='general', model='LOCAL',
                             rounds='f(maximum degree)', roundsDisplay='f(maximum degree)',
                             roundParameters=[{'symbol': 'Δ', 'name': 'maximum degree', 'introduced': False}])
        edge = self.one_at_problem(self.derive(source), 'edge-dominating-set')
        self.assertIn(r'f\bigl(\Delta_L\bigr)', edge['derivedMath']['rounds'])
        self.assertNotIn('maximum degree', edge['derivedMath']['rounds'])
        self.assertEqual(edge['sourceMath']['roundsDisplay'], 'f(maximum degree)')
        self.assertEqual(edge['sourceMath']['roundsDisplayTex'], self.notation['f(maximum degree)'])

    def test_symbolic_named_bound_never_reintroduces_prose_during_substitution(self):
        self.notation['F(Δ, f)'] = r'F\bigl(\Delta,f\bigr)'
        source = self.source(problem='dominating-set', graph='general', model='LOCAL',
                             rounds='F(Δ, f)', roundsDisplay='F(Δ, f)',
                             roundParameters=[
                                 {'symbol':'Δ', 'name':'maximum degree', 'introduced':False, 'displaySymbol':True},
                                 {'symbol':'f', 'name':'expansion function', 'introduced':False, 'displaySymbol':True},
                             ])
        edge = self.one_at_problem(self.derive(source), 'edge-dominating-set')
        self.assertIn(r'F\bigl(\Delta_L,f\bigr)', edge['derivedMath']['rounds'])
        self.assertNotIn('expansion function', edge['roundsDisplay'])
        self.assertNotIn('maximum degree', edge['roundsDisplay'])

    def test_named_approximation_and_runtime_parameters_are_instantiated_independently(self):
        self.notation.update({
            'f(maximum degree)': r'f\bigl(\text{maximum degree}\bigr)',
            'f(number of vertices)': r'f\bigl(\text{number of vertices}\bigr)',
            'Constant': r'\text{Constant}',
        })
        cases = (
            ('f(number of vertices)', [{'symbol': 'n', 'name': 'number of vertices', 'introduced': False}], r'f\bigl(m\bigr)'),
            ('Constant', None, r'\text{Constant}'),
        )
        for rounds, runtime_parameters, expected_runtime in cases:
            with self.subTest(rounds=rounds):
                source = self.source(problem='dominating-set', graph='general', model='LOCAL',
                                     approximation='f(maximum degree)', approximationDisplay='f(maximum degree)',
                                     approximationParameters=[{'symbol': 'Δ', 'name': 'maximum degree', 'introduced': False}],
                                     rounds=rounds, roundsDisplay=rounds)
                if runtime_parameters:
                    source['roundParameters'] = runtime_parameters
                original = deepcopy(source)
                edge = self.one_at_problem(self.derive(source), 'edge-dominating-set')
                self.assertEqual(edge['derivedMath']['approximation'], r'f\bigl(\Delta_L\bigr)')
                self.assertIn(expected_runtime, edge['derivedMath']['rounds'])
                self.assertNotIn(r'\Delta_L', edge['derivedMath']['rounds'],
                                 'the approximation parameter must not become a runtime parameter')
                self.assertNotIn('maximum degree', edge['derivedMath']['approximation'])
                self.assertNotIn('number of vertices', edge['derivedMath']['rounds'])
                self.assertEqual(edge['sourceMath']['approximationDisplay'], 'f(maximum degree)')
                self.assertNotIn('approximationParameters', edge,
                                 'evaluated formulas must not retain source-instance parameter bindings')
                self.assertEqual(source, original, 'the source theorem remains immutable')

    def test_original_article_link_and_math_survive_every_step_without_sota(self):
        source = self.source()
        results = self.derive(source)
        self.assertTrue(results)
        for result in results:
            for field in ('paperId', 'sourceUrl', 'year', 'randomization', 'objective'):
                self.assertEqual(result[field], source[field], field)
            self.assertEqual(result['sourceResultId'], source['id'])
            self.assertEqual(result['sourceVerification'], 'primary')
            self.assertEqual(result['verification'], 'derived')
            self.assertEqual(result['sourceMath']['rounds'], source['rounds'])
            self.assertEqual(result['sourceMath']['roundsTex'], self.notation[source['rounds']])
            self.assertEqual(result['sourceMath']['approximation'], source['approximation'])
            self.assertEqual(result['frontierStatus'], 'unreviewed')
            for field in ('sota', 'sotaScopeTransfers', 'frontierComparisons', 'tightness'):
                self.assertNotIn(field, result, field + ' requires a separate literature review')
            self.assertIn(source['assumptions'], result['assumptions'])
            self.assertIn(source['parameters'], result['parameters'])
            self.assertTrue(all(step['source']['url'].startswith('https://') for step in result['reductionSteps']))
            self.assertIn(result['rounds'], self.notation)
            self.assertIn(result['approximation'], self.notation)

    def test_caveated_secondary_and_claimed_articles_do_not_propagate(self):
        for changes in ({'caveat': 'The claimed proof is unresolved.'},
                        {'verification': 'survey'}, {'verification': 'derived'},
                        {'status': 'claimed'}, {'status': 'withdrawn'}, {'status': 'retracted'}):
            with self.subTest(changes=changes):
                self.assertEqual(self.derive(self.source(**changes)), [])

    def test_lower_bound_reverses_only_certified_identity_specializations(self):
        source = self.source(problem='dominating-set', graph='planar', bound='lower',
                             variant='Unweighted', model='LOCAL', rounds='F(n, Δ)')
        generalized = self.one_at_problem(self.derive(source), 'local-covering')
        self.assertEqual(generalized['reductionDirection'], 'lower')
        self.assertEqual(generalized['derivedMath']['rounds'], r'F(n,\Delta)')
        self.assertEqual(generalized['graphScope'], source['graphScope'])
        client = self.source(problem='client-dominating-set', graph='general', bound='lower')
        self.assertEqual(self.derive(client), [], 'T+1 upper conversion is not silently inverted')
        self.assertEqual(self.derive(self.source(bound='lower')), [],
                         'incidence simulations do not automatically reverse lower bounds')

    def test_congest_hardness_is_never_upgraded_to_local_hardness(self):
        rule = deepcopy(next(rule for rule in self.rules['entries'] if rule['id'] == 'mds-to-local-covering'))
        rule['models'] = ['LOCAL']
        source = self.source(problem='dominating-set', graph='general', bound='lower', model='CONGEST')
        self.assertEqual(self.derive(source, rules={'entries': [rule]}), [])

    def test_parameter_specialization_replaces_capacity_without_renaming_runtime_function(self):
        self.notation['f(n, Δ) + fk'] = r'f(n,\Delta)+fk'
        source = self.source(problem='f-matching', graph='general', objective='max',
                             variant='Fractional, unweighted', rounds='f(n, Δ) + fk')
        matching = self.one_at_problem(self.derive(source), 'maximum-matching')
        self.assertEqual(matching['derivedMath']['rounds'], r'f(n,\Delta)+1k')
        self.assertEqual(matching['objective'], 'max')
        self.assertIn('Unit-capacity specialization', matching['variant'])

    def test_results_are_reproducible_and_paths_acyclic(self):
        source = self.source()
        first = self.derive(source)
        second = self.derive(source)
        self.assertEqual(first, second)
        self.assertEqual(len({result['id'] for result in first}), len(first))
        for result in first:
            self.assertEqual(len(set(result['reductionPath'])), len(result['reductionPath']))
            self.assertLess(len(result['reductionPath']), len(self.problems['nodes']))
            self.assertTrue(result['id'].startswith('derived-' + source['id'] + '--'))

    def test_future_four_step_acyclic_recipe_chain_needs_no_engine_code_change(self):
        # The final two rules are deliberately synthetic certificates: this
        # tests closure mechanics, not additional claims about these problems.
        recipes = [deepcopy(rule) for rule in self.rules['entries'] if rule['id'] in {
            'fractional-vertex-cover-to-covering-lp',
            'vertex-cover-to-fractional-cover-rounding',
        }]
        template = next(rule for rule in self.rules['entries'] if rule['id'] == 'mds-to-local-covering')
        for rule_id, target, solver in (
            ('future-synthetic-step-three', 'dominating-set', 'vertex-cover'),
            ('future-synthetic-step-four', 'client-dominating-set', 'dominating-set'),
        ):
            rule = deepcopy(template)
            rule.update(id=rule_id, title='Synthetic engine regression certificate',
                        **{'from': target, 'to': solver})
            rule['engine']['sourceScopes'] = [solver]
            rule['engine']['lower'] = False
            recipes.append(rule)
        final = self.one_at_problem(self.derive(self.source(), rules={'entries': recipes}), 'client-dominating-set')
        self.assertEqual(final['reductionPath'], [
            'future-synthetic-step-four', 'future-synthetic-step-three',
            'vertex-cover-to-fractional-cover-rounding',
            'fractional-vertex-cover-to-covering-lp',
        ])

    def test_non_scalar_multi_objective_runtime_is_not_silently_reinterpreted(self):
        self.notation['first bound; second bound'] = r'F(n,\Delta);G(n,\Delta)'
        source = self.source(rounds='first bound; second bound')
        self.assertEqual(self.derive(source), [], 'a future curator must split distinct round statements before compilation')

    def test_future_connected_domination_uses_specific_certified_graph_multiplier(self):
        rule = self.domination_recipe()
        for graph, factor, certified_graph in (
            ('general','1+2∇₁',None), ('planar','7','planar'),
            ('pseudoforest','3','pseudoforest'), ('forest','3','forest'),
            ('oriented-path','3','forest'),
        ):
            with self.subTest(graph=graph):
                source = self.domination_source()
                source['graphScope'] = {'node':graph}
                source['graphClass'] = next(node['label'] for node in self.graphs['nodes'] if node['id']==graph)
                original = deepcopy(source)
                result = self.one_at_problem(self.derive(source, rules={'entries':[rule]}), 'connected-dominating-set')
                step = result['reductionSteps'][0]
                self.assertEqual(step['multiplier']['label'], factor)
                self.assertEqual(step['multiplier'].get('graph'), certified_graph)
                self.assertEqual(step['multiplierCertificate']['graphPath']['nodes'][0], graph)
                if certified_graph:
                    self.assertEqual(step['multiplierCertificate']['graphPath']['nodes'][-1], certified_graph)
                self.assertEqual(step['multiplierCertificate']['source'], rule['source'])
                self.assertIn(r'\cdot\bigl(1+\varepsilon\bigr)', result['derivedMath']['approximation'])
                self.assertEqual(result['inputConditions'], ['input-connected'])
                self.assertEqual(result['weightCondition'], 'weights-unweighted')
                self.assertEqual(result['roundClass'], source['roundClass'])
                self.assertEqual(source, original)

    def test_connector_numeric_round_budget_and_full_detail_add_four_without_certificates_leaking(self):
        self.notation.update({'Constant':r'\text{Constant}', '≤ 6':r'\le 6'})
        source = self.domination_source()
        source.update(rounds='Constant', roundsDisplay='≤ 6', roundClass='constant',
            approximationBenchmark='fractional', roundCountEvidence={'rounds':'≤ 6'},
            roundComplexityDetails={'status':'explicit', 'basis':'stated', 'formula':'≤ 6',
                                    'tex':r'\le 6', 'explanation':'A future explicit budget.', 'evidence':[]})
        original = deepcopy(source)
        rule = self.domination_recipe()
        result = self.one_at_problem(self.derive(source, rules={'entries':[rule]}), 'connected-dominating-set')
        self.assertEqual(result['roundsDisplay'], '≤ 10')
        self.assertEqual(result['derivedMath']['rounds'], r'\le 10')
        self.assertEqual(result['roundComplexityDetails']['formula'], '≤ 10')
        self.assertEqual(result['roundComplexityDetails']['basis'], 'reduction')
        self.assertEqual(result['roundClass'], 'constant')
        self.assertEqual(result['approximationBenchmark'], 'integral')
        self.assertEqual(result['sourceMath']['approximationBenchmark'], 'fractional')
        for field in ('sota','sotaScopeTransfers','frontierComparisons','tightness','roundCountEvidence'):
            self.assertNotIn(field, result)
        self.assertEqual(result['frontierStatus'], 'unreviewed')
        self.assertEqual(source, original)
        self.notation['4'] = '4'
        exact = self.domination_source()
        exact.update(rounds='4', roundClass='constant')
        result = self.one_at_problem(self.derive(exact, rules={'entries':[rule]}), 'connected-dominating-set')
        self.assertEqual(result['roundsDisplay'], '8', 'an exact four-round algorithm plus four rounds remains an exact numerical budget')
        self.assertEqual(result['sourceMath']['rounds'], '4')

    def test_converse_compares_integral_optima_and_preserves_the_original_round_budget(self):
        source = self.domination_source(converse=True)
        rule = self.domination_recipe(converse=True)
        result = self.one_at_problem(self.derive(source, rules={'entries':[rule]}), 'dominating-set')
        self.assertEqual(result['derivedMath']['approximation'], r'3\cdot\bigl(1+\varepsilon\bigr)')
        self.assertEqual(result['derivedMath']['rounds'], r'F(n,\Delta)')
        self.assertEqual(result['approximationBenchmark'], 'integral')
        self.assertEqual(result['inputConditions'], ['input-connected'])
        source['approximationBenchmark'] = 'fractional'
        self.assertEqual(self.derive(source, rules={'entries':[rule]}), [], 'the optimum comparison is not certified for a fractional CDS benchmark')

    def test_domination_guards_reject_unsupported_future_sources_without_parsing_prose(self):
        rule = self.domination_recipe()
        for changes in ({'weightCondition':'weights-weighted'}, {'weightCondition':'weights-unspecified'},
                        {'objective':'max'}, {'approximationBenchmark':'unknown'}, {'bound':'lower'},
                        {'verification':'survey'}, {'status':'retracted'}, {'caveat':'Unresolved proof'}):
            with self.subTest(changes=changes):
                source = self.domination_source()
                source.update(changes)
                self.assertEqual(self.derive(source, rules={'entries':[rule]}), [])
        source = self.domination_source()
        source.pop('weightCondition')
        self.assertEqual(self.derive(source, rules={'entries':[rule]}), [], 'the word Unweighted does not substitute for a reviewed typed weight fact')
        source = self.domination_source()
        source['problemScope'] = {'node':'distance-dominating-set'}
        self.assertEqual(self.derive(source, rules={'entries':[rule]}), [])
        problems = deepcopy(self.problems)
        next(node for node in problems['nodes'] if node['id']=='dominating-set')['outputKind'] = 'fractional-vector'
        self.assertEqual(derive_results([self.domination_source()], self.notation, problems, self.graphs, {'entries':[rule]}), [])
        unsupported = deepcopy(rule)
        unsupported['engine']['sourceGuards']['unknownGuard'] = True
        self.assertEqual(self.derive(self.domination_source(), rules={'entries':[unsupported]}), [])

    def test_connected_domain_persists_only_through_same_graph_certificates(self):
        converse = self.domination_recipe(converse=True)
        identity = deepcopy(next(rule for rule in self.rules['entries'] if rule['id']=='mds-to-local-covering'))
        identity.update(id='future-same-graph-followup', **{'from':'client-dominating-set', 'to':'dominating-set'})
        identity['engine'].update(sourceScopes=['dominating-set'], lower=False)
        line_graph = deepcopy(next(rule for rule in self.rules['entries'] if rule['id']=='edge-domination-to-domination'))
        source = self.domination_source(converse=True)
        source['inputConditions'] = ['input-proper-two-coloring']
        generated = self.derive(source, rules={'entries':[converse,identity,line_graph]})
        final = self.one_at_problem(generated, 'client-dominating-set')
        self.assertEqual(final['inputConditions'], ['input-proper-two-coloring','input-connected'])
        self.assertEqual(len(final['reductionSteps']), 2)
        self.assertFalse(self.at_problem(generated, 'edge-dominating-set'), 'connectivity of a transformed instance is not silently a fact about the physical graph')

    def test_recipe_parameters_and_aliases_survive_prior_steps_and_compilation(self):
        connector = self.domination_recipe()
        followup = deepcopy(next(rule for rule in self.rules['entries'] if rule['id']=='mds-to-local-covering'))
        followup.update(id='future-parameter-followup', **{'from':'client-dominating-set', 'to':'connected-dominating-set'})
        followup['engine'].update(sourceScopes=['connected-dominating-set'], lower=False)
        followup['parameterDefinitions'] = [{'symbol':'q', 'sourceSymbol':'old-q', 'description':'Followup parameter', 'tex':'q'}]
        source = self.domination_source()
        rules = {'entries':[connector,followup]}
        generated = self.derive(source, rules=rules)
        final = self.one_at_problem(generated, 'client-dominating-set')
        catalog = {'sourceResults':[source], 'results':generated, 'notation':self.notation, 'reductions':deepcopy(rules)}
        registry = {'version':1, 'results':{source['id']:[{'symbol':'p', 'sourceSymbol':'old-p', 'description':'Source parameter'}]}}
        compile_parameters(catalog, registry)
        definitions = {d['symbol']:d for d in final['parameterDefinitions']}
        self.assertEqual(definitions['∇₁']['sourceSymbol'], 'old-density')
        self.assertEqual(definitions['q']['sourceSymbol'], 'old-q')
        self.assertEqual(definitions['p']['sourceSymbol'], 'old-p')
        recipe = next(r for r in catalog['reductions']['entries'] if r['id']==connector['id'])
        recipe_definitions = {d['symbol']:d for d in recipe['parameterDefinitions']}
        self.assertIn('T', recipe_definitions)
        self.assertEqual(recipe_definitions['∇₁']['sourceSymbol'], 'old-density')

    def test_connector_rejects_stacked_round_metrics_while_zero_cost_comparison_retains_them(self):
        self.notation['total rounds; awake rounds'] = r'F(n,\Delta);G(n,\Delta)'
        source = self.domination_source()
        source['rounds'] = 'total rounds; awake rounds'
        self.assertEqual(self.derive(source, rules={'entries':[self.domination_recipe()]}), [])
        source['problemScope'] = {'node':'connected-dominating-set'}
        result = self.one_at_problem(self.derive(source, rules={'entries':[self.domination_recipe(converse=True)]}), 'dominating-set')
        self.assertEqual(result['derivedMath']['rounds'], r'F(n,\Delta);G(n,\Delta)')

    def test_substitution_is_simultaneous_and_preserves_tex_commands_and_text(self):
        tex = r'\log n+\text{n f}\operatorname{round}(n)+\Gamma_{d}+\Gamma_p+f(n,\Delta)+fk'
        result = substitute_tex(tex, {'n': 'n+m', 'm': '9', 'Γd': '2', 'Γp': 'Δ', 'f': '1', 'k': 'Δ'})
        self.assertEqual(result, r'\log \left(n+m\right)+\text{n f}\operatorname{round}(\left(n+m\right))+2+\Delta+f(\left(n+m\right),\Delta)+1\Delta')

    def test_build_ingests_a_manually_linked_future_article_and_derives_its_chain(self):
        """Exercise new data → canonical scopes → compiler → static catalog."""
        with TemporaryDirectory(prefix='atlas-future-paper-test-') as directory:
            target_root = Path(directory)
            target_data = target_root / 'dist' / 'data'
            target_data.mkdir(parents=True)
            for source_file in DATA.glob('*.json'):
                if source_file.name != 'catalog.json':
                    shutil.copyfile(source_file, target_data / source_file.name)
            general = json.loads((target_data / 'general.json').read_text())
            source = deepcopy(next(result for result in general['results'] if result['id'] == 'gen-low24-cover'))
            paper = deepcopy(next(paper for paper in general['papers'] if paper['id'] == source['paperId']))
            paper.update(id='future-build-new-article', title='A future manually linked covering-LP article',
                         authors='A Future Author', year=2026,
                         url='https://example.org/future-linked-paper')
            source.update(id='future-build-new-bound', paperId=paper['id'], year=2026,
                          sourceUrl=paper['url'], problem='covering-lp', graphClass='planar-incidence')
            general['papers'].append(paper)
            general['results'].append(source)
            (target_data / 'general.json').write_text(json.dumps(general))
            original_root = build_module.ROOT
            output = StringIO()
            try:
                build_module.ROOT = target_root
                with redirect_stdout(output):
                    build_module.build()
            finally:
                build_module.ROOT = original_root
            catalog = json.loads((target_data / 'catalog.json').read_text())
            canonical = next(result for result in catalog['sourceResults'] if result['id'] == source['id'])
            self.assertEqual(canonical['problemScope']['node'], 'covering-lp')
            self.assertEqual(canonical['problem'], next(node['label'] for node in self.problems['nodes'] if node['id'] == 'covering-lp'))
            self.assertEqual(canonical['graphScope']['node'], 'planar-incidence')
            self.assertEqual(canonical['graphClass'], next(node['label'] for node in self.graphs['nodes'] if node['id'] == 'planar-incidence'))
            conditions = read_data('conditions.json')
            weights = {profile['value']:profile['weights'] for profile in conditions['variants']}
            self.assertEqual(canonical['weightCondition'], weights.get(canonical['variant'], 'weights-unspecified'))
            self.assertEqual(conditions['facts'][canonical['weightCondition']]['kind'], 'weights')
            generated = [result for result in catalog['results'] if result.get('sourceResultId') == source['id']]
            fractional = self.one_at_problem(generated, 'fractional-vertex-cover')
            rounded = self.one_at_problem(generated, 'vertex-cover')
            self.assertEqual(fractional['graphScope']['node'], 'planar')
            self.assertEqual(rounded['parentResultId'], fractional['id'])
            self.assertEqual(len(rounded['reductionPath']), 2)
            self.assertEqual(rounded['paperId'], paper['id'])
            self.assertEqual(rounded['sourceUrl'], paper['url'])
            self.assertFalse(self.at_problem(generated, 'dominating-set'))
            self.assertFalse(self.at_problem(generated, 'fractional-dominating-set'))
            self.assertTrue((target_data / 'catalog.js').read_text().startswith('window.ATLAS_DATA = '))
            self.assertIn('automatic consequences', output.getvalue())


if __name__ == '__main__':
    unittest.main()
