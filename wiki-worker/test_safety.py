import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parent))

from safety import (  # noqa: E402
    BASELINE_MANIFEST_URL,
    PROJECT_ROOT,
    WIKI_API_URL,
    WIKI_OUTPUT_ROOT,
    baseline_manifest_url,
    contained_file,
    project_output_path,
    wiki_api_url,
)


class WikiSafetyTests(unittest.TestCase):
    def test_network_destinations_are_exactly_allowlisted(self):
        self.assertEqual(wiki_api_url(), WIKI_API_URL)
        self.assertEqual(baseline_manifest_url(), BASELINE_MANIFEST_URL)
        for value in (
            'http://enthusia.miraheze.org/w/api.php',
            'https://enthusia.miraheze.org.attacker.test/w/api.php',
            'https://user:password@enthusia.miraheze.org/w/api.php',
            'file:///etc/passwd',
        ):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    wiki_api_url(value)

    def test_output_paths_stay_in_the_generated_output_tree(self):
        self.assertEqual(project_output_path(), WIKI_OUTPUT_ROOT)
        self.assertEqual(
            project_output_path(default='wiki-worker-output/rendered'),
            WIKI_OUTPUT_ROOT / 'rendered',
        )
        with self.assertRaises(ValueError):
            project_output_path(str(PROJECT_ROOT / 'public'))
        with self.assertRaises(ValueError):
            project_output_path('wiki-worker-output', allow_root=False)

    def test_manifest_filenames_cannot_escape_the_render_directory(self):
        rendered = WIKI_OUTPUT_ROOT / 'rendered'
        self.assertEqual(contained_file(rendered, 'events.wiki'), rendered / 'events.wiki')
        for filename in ('../events.wiki', 'nested/events.wiki', ''):
            with self.subTest(filename=filename):
                with self.assertRaises(ValueError):
                    contained_file(rendered, filename)


if __name__ == '__main__':
    unittest.main()
