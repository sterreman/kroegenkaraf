import unittest
from taxonomy import parse_tags

class TagsTest(unittest.TestCase):
    def test_missing_tags_are_empty(self):
        self.assertEqual(parse_tags(None), [])
        self.assertEqual(parse_tags(''), [])

    def test_semicolons_whitespace_and_duplicates(self):
        self.assertEqual(parse_tags(' Terras ; Speciaalbier;Terras; '), ['Terras', 'Speciaalbier'])

    def test_spelling_is_not_silently_rewritten(self):
        with self.assertRaises(ValueError):
            parse_tags('terras')

    def test_comma_is_not_a_tag_separator(self):
        with self.assertRaises(ValueError):
            parse_tags('Terras, Biljart')


class TagGroepenTest(unittest.TestCase):
    """De groepen in het filterpaneel (assets/filterbalk.js) volgen taxonomy.py."""
    def test_elke_tag_staat_in_precies_een_groep(self):
        import re
        from pathlib import Path
        from taxonomy import TAGS
        js = (Path(__file__).resolve().parents[1] / 'assets/filterbalk.js').read_text(encoding='utf-8')
        blok = js[js.index('const TAGGROEPEN'):js.index('];', js.index('const TAGGROEPEN'))]
        lijsten = re.findall(r"\[\s*'([^']+)',\s*\[([^\]]*)\]", blok)
        tags = [t for _, inhoud in lijsten for t in re.findall(r"'([^']+)'", inhoud)]
        self.assertEqual(sorted(tags), sorted(TAGS))
        self.assertEqual(len(tags), len(set(tags)))

if __name__ == '__main__':
    unittest.main()
