"""Detailed runtimes preserve source precision, budget direction and reductions."""
from copy import deepcopy
from itertools import combinations, product
import json
from pathlib import Path
import unittest

from derive import derive_results
from round_details import compile_round_details


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT/'dist/data'


class DetailedRoundsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((DATA/'catalog.json').read_text())
        cls.rows = {r['id']:r for r in cls.catalog['results']}

    def test_compact_polylog_expands_only_in_detailed_metadata(self):
        row = self.rows['planar-weighted-independent-2006']
        self.assertEqual(row['roundsDisplay'], 'polylog n')
        detail = row['roundComplexityDetails']
        self.assertEqual(detail['status'], 'explicit')
        self.assertIn('log(12/11)', detail['formula'])
        self.assertIn('log* n', detail['formula'])
        self.assertIn('Fixed numerical exponent', next(p['description'] for p in row['parameterDefinitions'] if p['symbol']=='d'))

    def test_matching_keeps_compact_symbols_and_expands_all_phase_parameters(self):
        row = self.rows['gen-aprsu10-matching']
        self.assertEqual(row['roundsDisplay'], 'f(Δ, ε)')
        detail = row['roundComplexityDetails']
        self.assertIn(r'\sum', detail['tex'])
        self.assertIn(r'\lceil', detail['tex'])
        self.assertIn('Δ≤1', detail['explanation'])
        self.assertEqual(detail['basis'], 'derived-phase-bound')
        self.assertTrue({'K','i','Δ','ε'} <= {p['symbol'] for p in row['parameterDefinitions']})

    def test_control_function_composition_is_not_a_closed_genus_formula(self):
        row = self.rows['pic-thesis-genus-616']
        self.assertEqual(row['roundsDisplay'], 'f(g)')
        detail = row['roundComplexityDetails']
        self.assertEqual(detail['status'], 'partial')
        self.assertIn('F_g(10)', detail['formula'])
        self.assertIn('control function', next(p['description'] for p in row['parameterDefinitions'] if p['symbol']=='F_g'))

    def test_unquantified_parameter_functions_do_not_become_bare_universal_constants(self):
        row = self.rows['pic-thesis-pw2-dom']
        detail = row['roundComplexityDetails']
        self.assertEqual(detail['status'], 'not-stated')
        self.assertEqual(detail['formula'], 'f(H)')
        self.assertNotIn(detail['formula'], ('O(1)', 'Constant'))
        self.assertEqual(self.rows['gen-asw26-genus']['roundComplexityDetails']['status'], 'not-extracted')

    def test_checked_linear_refinement_preserves_original_statement_and_parameter_regime(self):
        for rid in ('pic-large-50-dom', 'pic-large-50-vc'):
            row = self.rows[rid]
            self.assertEqual(row['rounds'], 'Oₜ(1)')
            self.assertEqual(row['roundsDisplay'], 'O(t)')
            self.assertEqual(row['roundClass'], 'parameter')
            self.assertNotIn('roundParameters', row)
            self.assertEqual(row['roundComplexityDetails']['status'], 'explicit')
            self.assertTrue(row['roundComplexityDetails']['audited'])
            self.assertTrue(any('page=125' in item['url'] for item in row['roundComplexityDetails']['evidence']))

    def test_lower_budget_remains_quantified_and_survives_identity_transfer(self):
        source = self.rows['gen-as26-power-lower']
        derived = self.rows['derived-gen-as26-power-lower--mds-to-local-covering']
        for row in (source, derived):
            detail = row['roundComplexityDetails']
            self.assertEqual(detail['status'], 'impossibility')
            self.assertEqual(detail['formula'], 'Any T(r, ε) independent of n')
            self.assertTrue(row['roundBudgetExcluded'])
            self.assertEqual(row['approximationDisplay'], '≥ 2r + 1')

    def test_expanded_future_bound_composes_through_simulation_without_changing_compact_cost(self):
        source = deepcopy(self.rows['gen-as10-setcover'])
        source['id'] = 'future-setcover-explicit-rounds'
        source['roundComplexityDetails'] = {
            'status':'explicit', 'formula':'O(n + Δ²)', 'tex':r'O(n+\Delta^2)',
            'basis':'stated', 'explanation':'Future source theorem.', 'parameters':[],
            'evidence':[{'url':'https://example.org/theorem','title':'Future source','location':'Theorem 1'}],
        }
        notation = deepcopy(self.catalog['notation'])
        notation['O(n + Δ²)'] = source['roundComplexityDetails']['tex']
        results = derive_results([source], notation, self.catalog['problemNetwork'], self.catalog['graphNetwork'], self.catalog['reductions'])
        target = next(r for r in results if r['problemScope']['node']=='vertex-cover')
        self.assertNotIn('O(n + Δ²)', target['roundsDisplay'])
        self.assertIn('n+m', target['roundComplexityDetails']['tex'])
        self.assertIn(r'\max\{\Delta,2\}', target['roundComplexityDetails']['tex'])
        self.assertTrue(target['roundComplexityDetails']['tex'].endswith('+1'))
        self.assertEqual(target['sourceMath']['roundsDisplay'], source['roundsDisplay'])
        self.assertEqual(target['roundComplexityDetails']['derivedFrom'], source['id'])
        for result in results:
            self.assertEqual(result['roundComplexityDetails']['sourceBasis'], 'stated')

    def test_reductions_transform_the_runtime_without_wrapping_its_definitions_or_domain(self):
        source = deepcopy(self.rows['gen-as10-setcover'])
        source['id'] = 'future-setcover-with-defined-runtime'
        expression = {'formula':'O(n + Δ²)', 'tex':r'O(n+\Delta^2)'}
        suffix = {'formula':', where K = Δ and n ≥ 2', 'tex':r',\qquad K=\Delta,\ n\ge2'}
        source['roundComplexityDetails'] = {
            'status':'partial', 'formula':expression['formula']+suffix['formula'],
            'tex':expression['tex']+suffix['tex'], 'expression':expression, 'suffix':suffix,
            'basis':'stated-composition', 'explanation':'A future source with a definition and domain.', 'parameters':[],
            'evidence':[{'url':'https://example.org/theorem','title':'Future source','location':'Theorem 1'}],
        }
        results = derive_results([source], deepcopy(self.catalog['notation']), self.catalog['problemNetwork'], self.catalog['graphNetwork'], self.catalog['reductions'])
        for problem, cost in (('dominating-set', '2T'), ('vertex-cover', 'T+1')):
            target = next(r for r in results if r['problemScope']['node']==problem)
            detail = target['roundComplexityDetails']
            self.assertEqual(detail['tex'], detail['expression']['tex']+detail['suffix']['tex'])
            self.assertNotIn('K=', detail['expression']['tex'])
            self.assertNotIn(r'\ge', detail['expression']['tex'])
            if cost == '2T':
                self.assertTrue(detail['expression']['tex'].startswith(r'2\cdot\bigl('))
            else:
                self.assertTrue(detail['expression']['tex'].endswith('+1'))
                self.assertIn(r'K=\left(\max\{\Delta,2\}\right)', detail['suffix']['tex'])
                self.assertIn('n+m', detail['suffix']['tex'])
            self.assertEqual(detail['sourceBasis'], 'stated-composition')

    def test_review_registry_requires_sources_and_cannot_reinterpret_a_lower_budget(self):
        row = deepcopy(self.rows['gen-as26-power-lower'])
        for status in ('explicit', 'impossibility'):
            entry = {'resultId':row['id'], 'status':status, 'basis':'stated',
                     'formula':'6', 'tex':'6', 'explanation':'Invalid input', 'evidence':[]}
            with self.subTest(status=status), self.assertRaises(AssertionError):
                compile_round_details([deepcopy(row)], {p['id']:p for p in self.catalog['papers']}, deepcopy(self.catalog['notation']),
                                      {'version':1,'checked':'2026-11-16','entries':[entry]})

    def test_all_records_have_source_precision_without_dropping_stacked_resources(self):
        for row in self.catalog['results']:
            detail = row['roundComplexityDetails']
            self.assertTrue(detail['formula'] and detail['tex'] and detail['evidence'])
        row = self.rows['gen-jpp26-sleep']
        self.assertEqual(row['roundComplexityDetails']['formula'], row['roundsDisplay'])
        self.assertIn(';', row['roundComplexityDetails']['formula'])

    def test_four_round_weak_colouring_schedule_meets_the_guarantee_for_all_small_port_choices(self):
        row = self.rows['gen-aprsu10-dom']
        self.assertEqual((row['roundClass'], row['roundsDisplay']), ('constant', '≤ 4'))
        self.assertNotIn('roundParameters', row)
        self.assertEqual(row['roundCountEvidence']['basis'], 'phase-count')
        checked = 0
        for n in range(2, 5):
            pairs = list(combinations(range(n), 2))
            for mask in range(1, 1 << len(pairs)):
                neighbors = [set() for _ in range(n)]
                for index, (a,b) in enumerate(pairs):
                    if mask & (1 << index):neighbors[a].add(b);neighbors[b].add(a)
                if any(not x for x in neighbors):continue
                degree = max(map(len, neighbors))
                optimum = next(size for size in range(1,n+1) if any(
                    all(v in selected or neighbors[v].intersection(selected) for v in range(n))
                    for selected in map(set, combinations(range(n),size))))
                for colors in product((0,1), repeat=n):
                    if any(not any(colors[u]!=colors[v] for u in neighbors[v]) for v in range(n)):continue
                    black = [v for v in range(n) if colors[v]==0]
                    for parents in product(*[sorted(u for u in neighbors[v] if colors[u]==1) for v in black]):
                        black_parent = dict(zip(black, parents))
                        black_children = {w:[v for v in black if black_parent[v]==w] for w in range(n) if colors[w]==1}
                        white_leaves = [w for w,children in black_children.items() if not children]
                        for choices in product(*[sorted(u for u in neighbors[w] if colors[u]==0) for w in white_leaves]):
                            with_white_child = set(choices)
                            selected = with_white_child | {w for w,children in black_children.items() if any(v not in with_white_child for v in children)}
                            self.assertTrue(all(v in selected or neighbors[v].intersection(selected) for v in range(n)))
                            self.assertLessEqual(2*len(selected), (degree+1)*optimum)
                            checked += 1
        self.assertGreater(checked, 500)


if __name__ == '__main__':
    unittest.main(verbosity=2)
