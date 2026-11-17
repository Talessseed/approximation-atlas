"""New results must declare what their O(1) bounds depend on."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ConstantPolicyTests(unittest.TestCase):
    def test_numeric_factor_grammar_fails_closed_and_requires_review_for_universal_constants(self):
        sys.path.insert(0, str(ROOT/'scripts'))
        try:
            import build as build_module
        finally:
            sys.path.pop(0)
        for tex in (r'1', r'\frac{1}{2}', r'34.01', r'2\cdot\bigl(3+1\bigr)',
                    r'\left(2+3\right)/5', r'\ge 2', r'2^{-1}'):
            with self.subTest(numeric_factor=tex):
                self.assertTrue(build_module.is_constant_approximation(tex))
        for tex in (r'1+\varepsilon', r'2a+1', r'f(k)', r'\Omega(1)',
                    r'\text{Constant or polylogarithmic factor}', r'\frac{1}{0}',
                    r'2-3', r'2^{\Delta}', r'\text{in expectation} 2'):
            with self.subTest(dependent_or_invalid_factor=tex):
                self.assertFalse(build_module.is_constant_approximation(tex))
        self.assertFalse(build_module.is_constant_approximation(r'\text{Constant}'))
        self.assertTrue(build_module.is_constant_approximation(r'\text{Constant}', reviewed_universal=True))
        self.assertTrue(build_module.is_constant_approximation(r'2\cdot\bigl(\text{Constant}\bigr)', reviewed_universal=True))
        self.assertFalse(build_module.is_constant_approximation(r'\text{Constant}+a', reviewed_universal=True))

    def build_new_result(self, approximation, rounds, dependencies=None,
                         reviewed_universal=False, round_audit=None, bound='upper',
                         approximation_dependencies=None):
        with tempfile.TemporaryDirectory(prefix='atlas-constant-policy-') as directory:
            root = Path(directory)
            shutil.copytree(ROOT/'dist/data', root/'dist/data',
                            ignore=shutil.ignore_patterns('catalog.json', 'catalog.js'))
            (root/'scripts').mkdir()
            for name in ('build.py', 'derive.py', 'conditions.py', 'parameters.py', 'round_details.py'):
                shutil.copyfile(ROOT/'scripts'/name, root/'scripts'/name)
            path = root/'dist/data/general.json'
            data = json.loads(path.read_text())
            result = next(r.copy() for r in data['results'] if r['id']=='gen-asw26-planar')
            result.update(id='new-unreviewed-bound', approximation=approximation,
                          rounds=rounds, bound=bound,
                          parameters='The source supplies a fixed parameter p.')
            data['results'].append(result)
            path.write_text(json.dumps(data, ensure_ascii=False))
            if dependencies or reviewed_universal or approximation_dependencies:
                path = root/'dist/data/round-labels.json'
                labels = json.loads(path.read_text())
                if dependencies:
                    for field in ('results', 'approximationResults'):
                        labels[field][result['id']] = dependencies
                if approximation_dependencies:
                    labels['approximationResults'][result['id']] = approximation_dependencies
                if reviewed_universal:
                    labels['universalConstants']['rounds'].append(result['id'])
                path.write_text(json.dumps(labels, ensure_ascii=False))
            if round_audit is not None:
                path = root/'dist/data/round-counts.json'
                audit = json.loads(path.read_text())
                audit['entries'].append({
                    'resultIds': [result['id']],
                    'explanation': 'Test source has been checked for a complete communication count.',
                    'evidence': [{'url': 'https://example.org/test-source',
                                  'title': 'Test primary source', 'location': 'Theorem 1'}],
                    **round_audit,
                })
                path.write_text(json.dumps(audit, ensure_ascii=False))
            output = subprocess.run([sys.executable, '-B', str(root/'scripts/build.py')],
                                    capture_output=True, text=True, check=False)
            catalog = (json.loads((root/'dist/data/catalog.json').read_text())
                       if output.returncode==0 else None)
            return output, catalog

    def test_new_approximation_cannot_silently_become_universal(self):
        output, _ = self.build_new_result('O(1)', '1')
        self.assertNotEqual(output.returncode, 0)
        self.assertIn('approximation needs verified universal-constant status', output.stderr)

    def test_new_runtime_cannot_silently_become_universal(self):
        output, _ = self.build_new_result('2', 'O(1)')
        self.assertNotEqual(output.returncode, 0)
        self.assertIn('rounds needs verified universal-constant status', output.stderr)

    def test_new_subscripted_constant_ratio_requires_named_dependencies(self):
        output, _ = self.build_new_result('Oₖ,ₜ(1)', '1')
        self.assertNotEqual(output.returncode, 0)
        self.assertIn('approximation must display parameter-dependent constants as f(...)', output.stderr)
        output, catalog = self.build_new_result(
            'Oₖ,ₜ(1)', '1', approximation_dependencies=[
                {'symbol':'k', 'name':'radius'},
                {'symbol':'t', 'name':'excluded minor size'},
            ])
        self.assertEqual(output.returncode, 0, output.stderr)
        row = next(r for r in catalog['sourceResults'] if r['id']=='new-unreviewed-bound')
        self.assertEqual(row['approximationDisplay'], 'f(k, t)')
        self.assertEqual(row['roundsDisplay'], '1')
        self.assertEqual(row['approximation'], 'Oₖ,ₜ(1)', 'the source statement is preserved')

    def test_new_parameter_dependent_result_is_accepted_and_keeps_both_dependencies(self):
        output, catalog = self.build_new_result('O(1)', 'O(1)',
                                             [{'symbol':'p', 'name':'source parameter'}])
        self.assertEqual(output.returncode, 0, output.stderr)
        result = next(r for r in catalog['sourceResults'] if r['id']=='new-unreviewed-bound')
        self.assertEqual(result['approximationDisplay'], 'f(p)')
        self.assertEqual(result['roundsDisplay'], 'f(p)')
        self.assertEqual(result['roundClass'], 'parameter')
        self.assertEqual(result['frontierStatus'], 'unreviewed')

    def test_universal_review_also_requires_a_round_count_audit(self):
        output, _ = self.build_new_result('2', 'O(1)', reviewed_universal=True)
        self.assertNotEqual(output.returncode, 0)
        self.assertIn('Missing universal round-count audit', output.stderr)

    def test_audited_but_unspecified_total_remains_constant(self):
        output, catalog = self.build_new_result(
            '2', 'O(1)', reviewed_universal=True,
            round_audit={'basis': 'not-specified'})
        self.assertEqual(output.returncode, 0, output.stderr)
        result = next(r for r in catalog['sourceResults'] if r['id']=='new-unreviewed-bound')
        self.assertEqual(result['rounds'], 'O(1)')
        self.assertEqual(result['roundsDisplay'], 'Constant')
        self.assertEqual(result['roundCountEvidence']['basis'], 'not-specified')
        self.assertNotIn('rounds', result['roundCountEvidence'])

    def test_unspecified_evidence_cannot_invent_a_numeric_count(self):
        output, _ = self.build_new_result(
            '2', 'O(1)', reviewed_universal=True,
            round_audit={'basis': 'not-specified', 'rounds': '1'})
        self.assertNotEqual(output.returncode, 0)
        self.assertIn('Unverified numeric round count', output.stderr)

    def test_a_universal_lower_bound_cannot_receive_an_algorithm_round_count(self):
        output, _ = self.build_new_result(
            '2', 'O(1)', bound='lower', reviewed_universal=True,
            round_audit={'basis': 'stated', 'rounds': '1'})
        self.assertNotEqual(output.returncode, 0)
        self.assertIn('Round-count evidence requires an upper-bound O(1) source', output.stderr)


if __name__=='__main__':
    unittest.main()
