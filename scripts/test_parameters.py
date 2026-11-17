"""Semantic checks for symbolic bounds and result-specific parameter meanings."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from build import has_parameter_dependent_constant, named_bound
from parameters import compile_parameters, validate_registry


ROOT = Path(__file__).resolve().parents[1]


class ParameterDefinitionsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT/'dist/data/catalog.json').read_text())
        cls.registry = json.loads((ROOT/'dist/data/parameters.json').read_text())
        cls.rows = {r['id']: r for r in cls.catalog['results']}

    def definition(self, rid, symbol):
        return next(d for d in self.rows[rid]['parameterDefinitions'] if d['symbol'] == symbol)

    def test_all_named_dependencies_display_symbols_even_when_not_previously_introduced(self):
        for row in self.catalog['sourceResults']:
            for field, key in [('rounds', 'roundParameters'), ('approximation', 'approximationParameters')]:
                if key not in row:
                    continue
                definitions = {d['symbol']: d for d in row['parameterDefinitions']}
                for parameter in row[key]:
                    with self.subTest(result=row['id'], field=field, symbol=parameter['symbol']):
                        self.assertTrue(parameter['displaySymbol'])
                        self.assertNotEqual(parameter['symbol'], 'class')
                        self.assertIn(parameter['symbol'], definitions)
                expected = ('F' if any(p['symbol'] == 'f' or p['symbol'].startswith('f(') for p in row[key]) else 'f') + '(' + ', '.join(p['symbol'] for p in row[key]) + ')'
                if row.get('roundBudgetExcluded') and field == 'rounds':
                    expected += ' rounds ruled out'
                self.assertEqual(row[field+'Display'], expected)
        self.assertEqual(self.rows['sparse-expansion-constant']['roundsDisplay'], 'f(∇₁)')
        self.assertFalse(self.rows['gen-aprsu10-matching']['roundParameters'][0]['introduced'])
        self.assertEqual(self.rows['gen-aprsu10-matching']['roundsDisplay'], 'f(Δ, ε)')

    def test_reused_letters_keep_their_own_source_meaning(self):
        self.assertIn('average degree', self.definition('gen-p26-density', 'd')['description'])
        self.assertIn('dimension', self.definition('pic-nice-localgenus', 'd')['description'])
        self.assertIn('genus', self.definition('gen-asw26-genus', 'g')['description'])
        self.assertIn('Odd girth', self.definition('gen-ako18-oddgirth', 'g')['description'])
        self.assertIn('Expansion function', self.definition('pic-sublog-fmatching', 'g')['description'])
        self.assertIn('vertex-capacity', self.definition('pic-sublog-fmatching', 'f')['description'])
        self.assertIn('frequency', self.definition('gen-as10-setcover', 'f')['description'])

    def test_expansion_function_and_unspecified_bound_are_distinct(self):
        self.assertEqual(self.rows['amiri-distance']['approximationDisplay'], 'F(r, f)')
        self.assertEqual(self.rows['pic-girth-sublinear-lower']['roundsDisplay'], 'F(k, f(k)) rounds ruled out')
        self.assertIn('Expansion function', self.definition('amiri-distance', 'f')['description'])
        self.assertIn('Unspecified function', self.definition('amiri-distance', 'F')['description'])

    def test_parameter_dependent_constant_ratios_are_named_including_reductions(self):
        self.assertEqual(self.rows['pic-genus-broadcast-historical']['approximationDisplay'], 'f(g)')
        self.assertEqual(self.rows['pic-distance-k2t-constant']['approximationDisplay'], 'f(k, t)')
        derived = self.rows['derived-pic-genus-broadcast-historical--connected-domination-via-mds']
        self.assertIn('f(g)', derived['approximationDisplay'])
        self.assertIn('Orientable genus', self.definition('pic-genus-broadcast-historical', 'g')['description'])
        for row in self.catalog['results']:
            self.assertFalse(has_parameter_dependent_constant(self.catalog['notation'][row['approximationDisplay']]), row['id'])
        for tex in (r'O_g(1)', r'O_{k,t}\!\left(1\right)', r'O_{k,f(k)}(1)',
                    r'3\cdot\bigl(O_{\mathcal{C},\epsilon}(1)\bigr)'):
            self.assertTrue(has_parameter_dependent_constant(tex), tex)
        for tex in (r'24g+O(1)', r'\bigl(1+2\nabla_1\bigr)\cdot f(g)', r'O_g(\log n)'):
            self.assertFalse(has_parameter_dependent_constant(tex), tex)

    def test_density_bound_and_comparison_constant_keep_source_restrictions(self):
        self.assertIn('integer', self.definition('amiri-locally-embeddable', 'c')['description'])
        self.assertIn('depth-one', self.definition('amiri-locally-embeddable', '∇₁')['description'].lower())
        row = self.rows['pic-distance-minor-ptas']
        self.assertIn('O_C', row['roundsDisplay'])
        self.assertIn('positive integer', self.definition(row['id'], 'C')['description'])

    def test_definitions_are_valid_single_line_tex_and_each_result_has_a_profile(self):
        self.assertEqual(set(self.registry['results']), {r['id'] for r in self.catalog['sourceResults']})
        for row in self.catalog['results']:
            symbols = [d['symbol'] for d in row['parameterDefinitions']]
            self.assertEqual(len(symbols), len(set(symbols)), row['id'])
            for definition in row['parameterDefinitions']:
                self.assertTrue(definition['description'].strip())
                self.assertNotIn('\\\\', definition['tex'])
        self.assertEqual(self.definition('sparse-expansion-constant', '∇₁')['tex'], r'\nabla_1')

    def test_derived_graph_parameters_refer_to_the_correct_instance(self):
        rid = 'derived-gen-as10-setcover--edge-domination-to-domination--mds-to-set-cover'
        self.assertIn('original communication graph', self.definition(rid, 'n')['description'])
        self.assertIn('original communication graph', self.definition(rid, 'm')['description'])
        self.assertIn('line graph', self.definition(rid, 'Δ_L')['description'])
        self.assertIn('line graph', self.definition(rid, 'm_L')['description'])
        for recipe in self.catalog['reductions']['entries']:
            definitions = {d['symbol']: d['description'] for d in recipe['parameterDefinitions']}
            self.assertIn('transformed instance', definitions['T'])
            self.assertIn('Approximation ratio', definitions['α'])

    def test_new_article_can_supply_semantics_through_named_metadata(self):
        source = {
            'id':'future-result', 'roundsDisplay':'f(p)', 'approximationDisplay':'2',
            'roundParameters':[{'symbol':'p', 'name':'source width', 'introduced':False, 'displaySymbol':True}],
        }
        catalog = {'sourceResults':[source], 'results':[deepcopy(source)], 'notation':{}}
        compile_parameters(catalog, {'version':1, 'results':{}})
        self.assertEqual(catalog['results'][0]['parameterDefinitions'], [
            {'symbol':'f', 'description':'Unspecified function of the displayed parameters', 'tex':'f'},
            {'symbol':'p', 'description':'Source width', 'tex':'p'},
        ])
        self.assertEqual(source['roundsDisplay'], 'f(p)')

    def test_invalid_or_ambiguous_registry_definitions_fail(self):
        for definitions in (
            [{'symbol':'d', 'description':''}],
            [{'symbol':'d', 'description':'Degree'}, {'symbol':'d', 'description':'Dimension'}],
            [{'symbol':'d', 'description':'Degree', 'tex':r'\\Delta'}],
        ):
            with self.subTest(definitions=definitions), self.assertRaises(AssertionError):
                validate_registry({'version':1, 'results':{'x':definitions}}, {'x'})


if __name__ == '__main__':
    unittest.main(verbosity=2)
