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

if __name__ == '__main__':
    unittest.main()
