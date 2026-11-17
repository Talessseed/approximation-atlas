"""Presentation coverage for mathematics in graph-family names and evidence."""

from copy import deepcopy
import json
from pathlib import Path
import re
import unittest

from build import compile_graph_notation


ROOT = Path(__file__).resolve().parents[1]


def plain(parts):
    return ''.join(part if isinstance(part, str) else part['math'] for part in parts)


def formulas(parts):
    return [part['math'] for part in parts if isinstance(part, dict)]


class GraphNotationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT/'dist/data/catalog.json').read_text())
        cls.registry = json.loads((ROOT/'dist/data/graph-notation.json').read_text())

    def test_all_class_math_is_typed_and_preserves_the_full_display_text(self):
        values = {row.get(field, '') for row in self.catalog['results']
                  for field in ('graphClass', 'graphClassSource')}
        values.update(node['label'] for node in self.catalog['graphNetwork']['nodes'])
        math_marker = re.compile(r'[≤≥Δαβγρ∇₁₂₃₄ₕₜ]|\bpw\(|\|E\(|\^[({]|\b[rt]-th\b|\b[kr]-hop\b|\bradius-r\b|\bdimension d\b')
        for value in values:
            if not value:
                continue
            with self.subTest(label=value):
                if math_marker.search(value):
                    self.assertIn(value, self.catalog['graphNotation'])
                parts = self.catalog['graphNotation'].get(value, [value])
                self.assertEqual(plain(parts), value)
                for part in parts:
                    if isinstance(part, dict):
                        self.assertIn(part['math'], self.catalog['notation'])
                    else:
                        self.assertIsNone(math_marker.search(part), f'Unrendered mathematical text: {part!r}')

    def test_parameterized_class_names_keep_all_parameter_symbols_in_math(self):
        expected = {
            'Asymptotic dimension d; radius-r balls of Euler genus ≤ g': ['d', 'r', '≤ g'],
            'Asymptotic dimension d; radius-r balls of Euler genus ≤ g with at most a apices': ['d', 'r', '≤ g', 'a'],
            'Every minor H satisfies |E(H)| ≤ ρ|V(H)|': ['H', '|E(H)| ≤ ρ|V(H)|'],
            'H-minor-free; pw(H) ≤ 2': ['H', 'pw(H) ≤ 2'],
            'Kₜ-minor-free; γ₁(G) ≤ Cγₖ(G)': ['Kₜ', 'γ₁(G) ≤ Cγₖ(G)'],
            'Connected; k-hop expansion ≤ f(k); girth ≥ 4k + 3': ['k', '≤ f(k)', '≥ 4k + 3'],
            'Sub-logarithmic expansion f(r) = o(log r)': ['f(r) = o(log r)'],
            'No odd cycles of lengths 3, 5, …, 2k − 1': ['3, 5, …, 2k − 1'],
        }
        for label, expressions in expected.items():
            with self.subTest(label=label):
                self.assertEqual(formulas(self.catalog['graphNotation'][label]), expressions)

    def test_compilation_changes_only_presentation_metadata(self):
        candidate = deepcopy(self.catalog)
        results = deepcopy(candidate['results'])
        network = deepcopy(candidate['graphNetwork'])
        facts = {fid: {key: value for key, value in fact.items() if key != 'parts'}
                 for fid, fact in candidate['conditions'].items()}
        compile_graph_notation(candidate, deepcopy(self.registry))
        self.assertEqual(candidate['results'], results)
        self.assertEqual(candidate['graphNetwork'], network)
        self.assertEqual({fid: {key: value for key, value in fact.items() if key != 'parts'}
                          for fid, fact in candidate['conditions'].items()}, facts)
        self.assertEqual(candidate, self.catalog, 'the graph presentation pass is idempotent')
        for label, parts in candidate['graphNotation'].items():
            self.assertEqual(plain(parts), label)
        for fact in candidate['conditions'].values():
            if 'parts' in fact:
                self.assertEqual(plain(fact['parts']), fact['label'])

    def test_new_graph_labels_reuse_fragments_without_article_specific_rules(self):
        candidate = deepcopy(self.catalog)
        label = 'New family: K₂,t-minor-free; Euler genus ≤ g'
        candidate['graphNetwork']['nodes'].append({
            'id': 'future-family', 'label': label,
            'description': 'Hence a graph has a canonical presentation.',
            'aliases': [],
        })
        compile_graph_notation(candidate, deepcopy(self.registry))
        self.assertEqual(formulas(candidate['graphNotation'][label]), ['K₂,t', '≤ g'])
        self.assertNotIn('Hence a graph has a canonical presentation.', candidate['graphNotation'])

    def test_boundary_rules_protect_ordinary_prose_and_identifier_fragments(self):
        candidate = deepcopy(self.catalog)
        description = 'Hence a graph has K80 in its identifier, and an ordinary a article.'
        candidate['graphNetwork']['nodes'].append({
            'id': 'boundary-example', 'label': 'Ordinary graph family',
            'description': description, 'aliases': [],
        })
        compile_graph_notation(candidate, deepcopy(self.registry))
        self.assertNotIn(description, candidate['graphNotation'])
        self.assertNotIn('a', candidate['graphMathFragments'])
        self.assertNotIn('A', candidate['graphMathFragments'])

    def test_prerequisites_and_graph_evidence_share_the_same_math_parts(self):
        self.assertEqual(formulas(self.catalog['graphNotation']['Known n and Δ']), ['n', 'Δ'])
        for node in self.catalog['graphNetwork']['nodes']:
            if node['id'] == 'local-apex':
                self.assertEqual(formulas(self.catalog['graphNotation'][node['description']]), ['d', 'a', 'r', 'g', 'r'])
        edge = next(edge for edge in self.catalog['graphNetwork']['edges']
                    if edge['subset'] == 'k2t' and edge['superset'] == 'minor-pw2')
        self.assertEqual(formulas(self.catalog['graphNotation'][edge['reason']]),
                         ['H=K₂,t', 't≥2', '{u,v,w_i}', 'w_i', 't'])
        fact = self.catalog['conditions']['graph-connected-euler']
        self.assertEqual(formulas(fact['parts']), ['≤ g'])
        reviewed = self.catalog['conditions']['parameter-depth-one-excluded-k3t']
        self.assertEqual(formulas(reviewed['parts']), ['K₃,ₜ', 't ≥ 3'])
        for expression in ('C₅', 'K₂,s', '≤ t−1'):
            self.assertEqual(self.catalog['graphMathFragments'][expression], [{'math': expression}])
            self.assertIn(expression, self.catalog['notation'])

    def test_registry_rejects_mismatched_text_unknown_tex_and_unsafe_articles(self):
        for kind in ('text', 'unknown', 'conflict', 'article'):
            registry = deepcopy(self.registry)
            if kind == 'text':
                registry['fragments']['K₂,t'] = ['K₂,s']
            elif kind == 'unknown':
                registry['fragments']['K₂,t'] = [{'math': 'unregistered formula'}]
            elif kind == 'conflict':
                registry['notation']['g'] = 'h'
            else:
                registry['fragments']['a'] = [{'math': 'a'}]
            with self.subTest(kind=kind), self.assertRaises(AssertionError):
                compile_graph_notation(deepcopy(self.catalog), registry)


if __name__ == '__main__':
    unittest.main(verbosity=2)
