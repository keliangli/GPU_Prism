import ast
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools.code_atlas.extract_graph import extract
from tools.code_atlas.file_descriptions import clean_doc, describe_file


class ExtractorTests(unittest.TestCase):
    def extract_files(self, files):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, text in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8")
            first = extract(root, "fixture", "example", False)
            self.assertEqual(json.dumps(first), json.dumps(extract(root, "fixture", "example", False)))
            return first

    def test_root_relative_and_namespace_imports(self):
        graph = self.extract_files({
            "__init__.py": "",
            "foo.py": "VALUE = 1",
            "ns/sub.py": "VALUE = 2",
            "absolute.py": "from example import foo\nfrom example.ns import sub",
            "relative.py": "from . import foo",
            "package.py": "import example",
        })
        edges = {(edge["from"], edge["to"]) for edge in graph["imports"]}
        self.assertEqual(edges, {("absolute.py", "foo.py"), ("absolute.py", "ns/sub.py"), ("relative.py", "foo.py"), ("package.py", "__init__.py")})
        self.assertEqual(graph["meta"]["unresolvedImports"], 0)

    def test_descriptions_have_real_symbol_ids_and_source_docs(self):
        graph = self.extract_files({"f.py": '''"""A useful module overview."""
class A:
    def load(self): pass
def load():
    """Read model weights."""
    pass
''', "__init__.py": ""})
        file = next(file for file in graph["files"] if file["id"] == "f.py")
        description = file["description"]
        self.assertEqual(description["moduleDoc"], "A useful module overview.")
        self.assertIn("Read model weights.", [key["doc"] for key in description["keySymbols"]])
        symbols = {symbol["id"]: symbol for symbol in file["symbols"]}
        for key in description["keySymbols"]:
            self.assertEqual(symbols[key["id"]]["start"], key["start"])
        self.assertTrue(description["responsibilities"])
        self.assertIn("没有可执行", graph["files"][0]["description"]["summary"])

    def test_invalid_and_empty_files_are_not_given_invented_functionality(self):
        graph = self.extract_files({"broken.py": "def (", "models/empty.py": ""})
        self.assertEqual(graph["meta"]["parseErrors"], 1)
        self.assertEqual(graph["meta"]["sourceErrors"][0]["file"], "broken.py")
        self.assertEqual(graph["files"][0]["description"]["basis"], "unavailable")
        self.assertIn("没有可执行", graph["files"][1]["description"]["summary"])
        empty = self.extract_files({})
        self.assertEqual(empty["files"], [])

    def test_read_errors_remain_visible(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "unreadable.py").touch()
            with patch.object(Path, "read_text", side_effect=OSError("fixture read failure")):
                graph = extract(root, "fixture", "example", False)
            self.assertEqual(graph["meta"]["sourceErrors"][0]["kind"], "read")
            self.assertEqual(graph["files"][0]["description"]["basis"], "unavailable")

    def test_utf8_bom_does_not_hide_valid_definitions(self):
        graph = self.extract_files({"bom.py": '\ufeff"""Module documentation."""\nclass Model: pass\n'})
        self.assertEqual(graph["meta"]["parseErrors"], 0)
        self.assertEqual(graph["files"][0]["description"]["keySymbols"][0]["name"], "Model")

    def test_license_is_removed_but_functional_docs_are_retained(self):
        text = "Copyright 2026 Example\n\nLicensed under the Apache License\n\nMemory pool.\n\nStores KV tensors."
        self.assertEqual(clean_doc(text), "Memory pool.\n\nStores KV tensors.")

    def test_sglang_guides_do_not_leak_into_other_packages(self):
        tree = ast.parse("class Scheduler: pass")
        self.assertEqual(describe_file("managers/scheduler.py", tree)["basis"], "guide")
        self.assertEqual(describe_file("managers/scheduler.py", tree, prefix="example")["basis"], "structure")


if __name__ == "__main__":
    unittest.main()
