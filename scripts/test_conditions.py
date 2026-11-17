"""Semantic regressions for shared settings and separately reviewed claims."""

import json
import unittest
from copy import deepcopy
from pathlib import Path

from conditions import compile_conditions


ROOT = Path(__file__).resolve().parents[1]
SOURCE_FIELDS = (
    'problem', 'variant', 'graphClass', 'model', 'randomization', 'bound',
    'approximation', 'approximationDisplay', 'approximationBenchmark',
    'rounds', 'roundsDisplay', 'parameters', 'assumptions', 'summary',
    'sourceUrl', 'theorem', 'sourceVariant', 'sourceResultId',
    'reductionPath', 'reductionSteps', 'algorithm', 'proofSketch', 'proofFormula',
)


class ConditionSemanticsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_catalog = json.loads((ROOT / 'dist/data/catalog.json').read_text())
        cls.registry = json.loads((ROOT / 'dist/data/conditions.json').read_text())
        cls.catalog = deepcopy(cls.source_catalog)
        compile_conditions(cls.catalog, deepcopy(cls.registry))
        cls.rows = {row['id']: row for row in cls.catalog['results']}
        cls.facts = cls.catalog['conditions']

    def labels(self, ids):
        return [self.facts[fid]['label'] for fid in ids]

    def extras(self, row, claim):
        return [fid for fid in claim['conditionIds'] if fid not in row['setting']['covered']]

    def tight_application(self, row, certificate_id):
        return next(app for app in row['tightness'] if app['certificateId'] == certificate_id)

    def test_regular_vertex_cover_has_one_setting_and_preserves_source_fields(self):
        row = self.rows['folklore-regular-vc']
        self.assertEqual(self.labels(row['setting']['summary']), [
            'Regular graphs, degree ≥ 1', 'Unweighted',
        ])
        self.assertEqual(row['setting']['parameters'], [])
        self.assertEqual(row['setting']['assumptions'], [])
        self.assertEqual(self.labels(row['setting']['detail']), [
            'Identifiers unnecessary', 'Degree knowledge unnecessary',
        ])
        self.assertEqual(self.extras(row, row['sota']), [])
        for application in row['tightness']:
            self.assertEqual(self.extras(row, application), [])
        # Presentation must never erase or rewrite the original theorem,
        # construction or source assumptions, including generated provenance.
        originals = {r['id']: r for r in self.source_catalog['results']}
        for rid, compiled in self.rows.items():
            with self.subTest(result=rid):
                for field in SOURCE_FIELDS:
                    self.assertEqual(compiled.get(field), originals[rid].get(field), field)

    def test_large_t_algorithm_domain_is_separate_from_its_sota_review_range(self):
        row = self.rows['pic-large-50-dom']
        self.assertIn('Fixed integer t ≥ 2', self.labels(row['setting']['summary']))
        extras = self.extras(row, row['sota'])
        self.assertEqual(self.labels(extras), ['t ≥ 49'])
        self.assertEqual(self.facts[extras[0]]['kind'], 'claim')
        self.assertNotIn(extras[0], row['setting']['covered'])
        for field in ('summary', 'parameters', 'assumptions', 'detail'):
            self.assertNotIn(extras[0], row['setting'][field], field)
        self.assertEqual(row['setting']['parameters'], [])
        self.assertIn('excluded', next(d['description'] for d in row['parameterDefinitions'] if d['symbol'] == 't').lower())

    def test_local_embeddability_defines_both_parameters_without_dropping_integer_input(self):
        row = self.rows['amiri-locally-embeddable']
        self.assertEqual(self.labels(row['setting']['summary']), [
            'Locally embeddable', 'Unweighted',
            'K₃,ₜ excluded as a depth-1 minor (t ≥ 3)',
            'Known integer c ≥ ∇₁(G)',
        ])
        self.assertEqual(row['approximationDisplay'], '6c²t + (2t + 5)c + 4')
        self.assertEqual(row['roundsDisplay'], '≤ 6')
        self.assertIn('maximum edge density', ' '.join(self.labels(row['setting']['parameters'])))
        self.assertIn('c=⌈∇₁(G)⌉ if this value is supplied', ' '.join(self.labels(row['setting']['detail'])))
        self.assertEqual(self.labels(row['setting']['assumptions']), ['Distinct identifiers', 'Embedding unnecessary'])
        self.assertIn('supplied integer c', row['assumptions'])
        # The readable/export label and typed MathJax parts must say the same thing.
        for fid in row['setting']['summary'] + row['setting']['parameters'] + row['setting']['detail']:
            fact = self.facts[fid]
            if 'parts' in fact:
                self.assertEqual(''.join(p if isinstance(p, str) else p['math'] for p in fact['parts']), fact['label'])
        for invalid in ('missing-notation', 'different-label'):
            registry = deepcopy(self.registry)
            fact = registry['facts']['input-integer-depth-one-density']
            if invalid == 'missing-notation':
                fact['parts'] = [{'math': 'unregistered TeX'}]
            else:
                fact['parts'] = ['A different condition']
            with self.subTest(invalid=invalid), self.assertRaises(AssertionError):
                compile_conditions(deepcopy(self.source_catalog), registry)

    def test_minor_density_sota_and_tightness_keep_different_integer_domains(self):
        row = self.rows['gen-asw26-minordensity']
        self.assertIn('Fixed rational a ≥ 1', self.labels(row['setting']['parameters']))
        self.assertEqual(self.labels(self.extras(row, row['sota'])), ['Integer a ≥ 2'])
        application = self.tight_application(row, 'minor-density-factor')
        self.assertEqual(self.labels(self.extras(row, application)), ['Integer a ≥ 1'])
        transfer = next(t for t in row['sotaScopeTransfers'] if t['graph'] == 'planar')
        self.assertEqual(self.labels(transfer['settingConditionIds']), ['a=3'])
        self.assertEqual(transfer['claimConditionIds'], [])
        # A reviewed parameter binding covers its weaker integer-domain fact.
        binding = self.facts[transfer['settingConditionIds'][0]]
        self.assertIn(row['sota']['conditionIds'][0], binding['implies'])

    def test_source_domains_do_not_silently_gain_claim_only_restrictions(self):
        for rid in ('gen-dp26-matching', 'gen-dp26-cover'):
            with self.subTest(result=rid):
                row = self.rows[rid]
                self.assertIn('0 < ε < 1', self.labels(row['setting']['covered']))
                self.assertNotIn('Fixed ε', self.labels(row['setting']['covered']))
                self.assertIn('Fixed ε', self.labels(self.extras(row, row['sota'])))
        set_cover = self.rows['gen-as10-setcover']
        self.assertEqual(self.labels(self.extras(set_cover, set_cover['sota'])), ['f ≤ k'])
        covering = self.rows['gen-asw26-cover-det']
        self.assertIn('ε > 0', self.labels(covering['setting']['covered']))
        self.assertEqual(self.labels(self.extras(covering, covering['sota'])), ['0 < ε < 1/4'])
        self.assertIn('In n; fixed ρ, b, ε', self.labels(self.extras(
            covering, self.tight_application(covering, 'dominating-logstar-rounds'),
        )))
        for rid, epsilon_domain in (
            ('gen-ffk21-vc-bip', '0 < ε ≤ 1'),
            ('gen-hs22-mwm', '0 < ε < 1'),
        ):
            with self.subTest(result=rid):
                row = self.rows[rid]
                self.assertEqual(row['parameters'], '')
                self.assertEqual(row['assumptions'], '')
                self.assertEqual(self.labels(self.extras(row, row['sota'])), [
                    epsilon_domain, 'Source CONGEST weight encoding',
                ])
                self.assertNotIn('Source CONGEST weight encoding', self.labels(row['setting']['covered']))
        supplied_coloring = self.rows['gen-aprsu10-matching']
        self.assertIn('ε > 0', self.labels(self.extras(supplied_coloring, supplied_coloring['sota'])))

    def test_reviewed_decompositions_keep_definitions_and_implementation_facts_once(self):
        for rid in ('gen-fk25-arboricity-fast', 'gen-fk25-arboricity-better'):
            with self.subTest(result=rid):
                row = self.rows[rid]
                self.assertIn('w(V) is total input weight, hence at least OPT',
                              self.labels(row['setting']['detail']))
                self.assertIn('Node weights fit one CONGEST message',
                              self.labels(row['setting']['detail']))
        for rid in ('gen-low24-cover', 'gen-low24-pack'):
            with self.subTest(result=rid):
                row = self.rows[rid]
                self.assertIn('Variable–constraint incidence graph',
                              self.labels(row['setting']['summary']))
                self.assertIn('Nonzero normalized coefficients Aᵢⱼ ≥ 1',
                              self.labels(row['setting']['summary']))
                self.assertIn('Source CONGEST coefficient encoding',
                              self.labels(row['setting']['summary']))
                self.assertEqual(row['setting']['assumptions'], [])
        girth = self.rows['pic-girth-sublinear']
        self.assertIn('k ≥ 1', self.labels(girth['setting']['parameters']))
        self.assertEqual(self.labels(girth['setting']['detail']).count(
            'Algorithm need not know f(k)'), 1)
        self.assertNotIn('Algorithm need not know f(k)',
                         ' '.join(self.labels(girth['setting']['parameters'])))
        exact = self.rows['gen-beks18-exact2']
        self.assertIn('Known Δ or a polynomial upper bound; common polynomial bound B ≥ nW',
                      self.labels(exact['setting']['summary']))
        random_cover = self.rows['gen-asw26-cover-random']
        self.assertIn('Output always feasible', self.labels(random_cover['setting']['detail']))

    def test_cycle_specialization_is_attached_to_the_precise_tight_application(self):
        upper = self.rows['pic-girth-pruning']
        cycle = self.tight_application(upper, 'long-cycle-distance-factor')
        self.assertEqual(self.labels(self.extras(upper, cycle)), [
            'f(k)=1', 'k=r', 'r > 1 and r=o(log* n)',
        ])
        threshold = self.tight_application(upper, 'distance-k-round-threshold')
        self.assertEqual(self.labels(self.extras(upper, threshold)), ['k ≥ 2', 'f(k) ≥ 1'])
        self.assertEqual(cycle['graphs'], ['long-cycle'])
        self.assertNotIn('long-cycle', threshold['graphs'])
        lower = self.rows['pic-girth-cycle-lower']
        lower_application = self.tight_application(lower, 'long-cycle-distance-factor')
        self.assertEqual(self.extras(lower, lower_application), [])
        certificate = next(c for c in self.catalog['tightBounds']['certificates']
                           if c['id'] == 'long-cycle-distance-factor')
        source_applications = {a['resultId']: a for a in certificate['applications']}
        self.assertEqual(cycle['conditionIds'], source_applications[upper['id']]['conditionIds'])
        self.assertEqual(lower_application['conditionIds'], source_applications[lower['id']]['conditionIds'])
        self.assertNotEqual(cycle['conditionIds'], lower_application['conditionIds'])

    def test_derived_settings_follow_target_weights_and_keep_source_variant_in_details(self):
        source = self.rows['gen-low24-cover']
        target = self.rows['derived-gen-low24-cover--fractional-domination-to-covering-lp']
        self.assertIn('Normalized positive LP coefficients', self.labels(source['setting']['summary']))
        self.assertIn('Unweighted', self.labels(target['setting']['summary']))
        self.assertNotIn('Normalized positive LP coefficients', self.labels(target['setting']['summary']))
        self.assertIn('Source variant: Fractional positive LP', self.labels(target['setting']['detail']))
        preserve = self.rows['derived-gen-asw26-cover-det--mds-to-local-covering']
        self.assertIn('Positive integer costs ≤ b', self.labels(preserve['setting']['summary']))
        construction = self.rows['derived-folklore-degree-mds--edge-domination-to-domination']
        self.assertEqual(self.labels(construction['setting']['summary']), ['General', 'Unweighted'])
        self.assertIn('Source variant: Unweighted; select all vertices', self.labels(construction['setting']['detail']))

    def test_compilation_is_idempotent_and_all_presentation_references_resolve(self):
        again = deepcopy(self.catalog)
        compile_conditions(again, deepcopy(self.registry))
        self.assertEqual(again, self.catalog)
        for row in self.rows.values():
            with self.subTest(result=row['id']):
                displayed = []
                for field in ('summary', 'parameters', 'assumptions', 'detail'):
                    displayed.extend(row['setting'][field])
                self.assertEqual(len(displayed), len(set(displayed)))
                self.assertTrue(set(row['setting']['covered']) <= self.facts.keys())
                for claim in ([row['sota']] if row.get('sota') else []) + row.get('tightness', []):
                    self.assertIn('conditionIds', claim)
                    self.assertTrue(set(claim['conditionIds']) <= self.facts.keys())
                for transfer in row.get('sotaScopeTransfers', []) + row.get('sotaProjections', []):
                    self.assertTrue(set(transfer['conditionIds']) <= self.facts.keys())
                    self.assertTrue(set(transfer['settingConditionIds']) <= self.facts.keys())
        # New ordinary records have a safe whole-string fallback. A new
        # literature-status claim still requires a separately reviewed entry.
        future_catalog = deepcopy(self.source_catalog)
        future = deepcopy(future_catalog['results'][0])
        future.update(id='future-opaque-setting', variant='New opaque source variant',
                      parameters='A new complete parameter paragraph.',
                      assumptions='A new complete assumption paragraph.')
        future_catalog['results'].append(future)
        compile_conditions(future_catalog, deepcopy(self.registry))
        self.assertIn('weights-unspecified', future['setting']['summary'])
        self.assertIn(future['variant'], [future_catalog['conditions'][fid]['label']
                                        for fid in future['setting']['detail']])

    def test_incomplete_claim_reviews_and_invalid_fact_graphs_fail_clearly(self):
        cases = (
            ('missing SOTA profile', lambda r: r['sota'].pop(), 'SOTA condition profiles differ'),
            ('missing transfer profile', lambda r: r['transfers'].pop(), 'Transfer condition profiles differ'),
            ('missing certificate profile', lambda r: r['tight'].pop(), 'Tightness condition profiles differ'),
            ('missing application profile', lambda r: r['tight'][0]['applications'].pop(), 'Tightness applications differ'),
            ('unknown condition reference', lambda r: r['sota'][0]['conditionIds'].append('unknown-fact'), 'Unknown condition reference'),
            ('implication cycle', lambda r: r['facts']['weights-weighted'].update(implies=['weights-integer-W']), 'Condition implication cycle'),
            ('duplicate result profile', lambda r: r['profiles'].append(deepcopy(r['profiles'][0])), 'Duplicate result condition profile'),
            ('duplicate SOTA profile', lambda r: r['sota'].append(deepcopy(r['sota'][0])), 'Duplicate SOTA condition profile'),
            ('unknown result profile', lambda r: r['profiles'].append({'resultId': 'unknown-result'}), 'Unknown result condition profiles'),
        )
        for label, change, message in cases:
            with self.subTest(invalid_registry=label):
                registry = deepcopy(self.registry)
                change(registry)
                with self.assertRaisesRegex(AssertionError, message):
                    compile_conditions(deepcopy(self.source_catalog), registry)


if __name__ == '__main__':
    unittest.main(verbosity=2)
