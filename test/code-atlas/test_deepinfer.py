import json
from pathlib import Path
import tempfile
import unittest

from tools.code_atlas.extract_deepinfer import extract_repository
from tools.code_atlas.extract_graph import extract


class RepositoryExtractorTests(unittest.TestCase):
    def test_repository_imports_stubs_native_includes_and_bindings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            files = {
                "deepinfer/__init__.py": "",
                "deepinfer/engine/main.py": "from deepinfer._C.engine import Scheduler\nfrom deep_cluster.hardware import device\nimport torch\n",
                "deepinfer/_C/__init__.pyi": "from . import engine\n",
                "deepinfer/_C/engine.pyi": "class Scheduler:\n    def schedule(self): ...\n",
                "deep_cluster/hardware/__init__.py": "",
                "deep_cluster/hardware/device.py": "def device(): pass\n",
                "csrc/engine/pybind.cpp": '#include "scheduler.hpp"\n#include <vector>\n// #include "ignored.hpp"\n/*\n#include "ignored.hpp"\n*/\n',
                "csrc/engine/scheduler.hpp": '#include "../utils/pool.hpp"\nstruct Scheduler {};\n',
                "csrc/utils/pool.hpp": "#pragma once\n",
                "vendor/external.py": "raise RuntimeError('must not execute')\n",
                "deepinfer/__pycache__/ignored.py": "invalid syntax!",
            }
            for name, text in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8")
            graph = extract_repository(root, with_timestamp=False)
            self.assertEqual(json.dumps(graph), json.dumps(extract_repository(root, with_timestamp=False)))
            self.assertEqual(graph["meta"]["parseErrors"], 0)
            self.assertEqual(graph["meta"]["fileCount"], 9)
            edges = {(edge["from"], edge["to"], edge["kind"]) for edge in graph["imports"]}
            self.assertIn(("deepinfer/engine/main.py", "deepinfer/_C/engine.pyi", "import"), edges)
            self.assertIn(("deepinfer/engine/main.py", "deep_cluster/hardware/device.py", "import"), edges)
            self.assertIn(("deepinfer/_C/__init__.pyi", "deepinfer/_C/engine.pyi", "import"), edges)
            self.assertIn(("deepinfer/_C/engine.pyi", "csrc/engine/pybind.cpp", "binding"), edges)
            self.assertIn(("csrc/engine/pybind.cpp", "csrc/engine/scheduler.hpp", "include"), edges)
            self.assertIn(("csrc/engine/scheduler.hpp", "csrc/utils/pool.hpp", "include"), edges)
            self.assertEqual(graph["meta"]["unresolvedIncludes"], 1)
            self.assertEqual(graph["meta"]["unresolvedImports"], 1)
            native = next(file for file in graph["files"] if file["id"] == "csrc/engine/pybind.cpp")
            self.assertEqual(native["codeLines"], 2)
            self.assertEqual(native["symbols"], [])
            self.assertNotEqual(native["description"]["basis"], "unavailable")
            self.assertEqual(native["district"], "csrc/engine")
            stub = next(file for file in graph["files"] if file["id"] == "deepinfer/_C/engine.pyi")
            self.assertEqual(stub["language"], "Python stub")
            self.assertEqual(len(stub["symbols"]), 2)

    def test_longest_district_root_wins(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "deepinfer/model_executor/layers/tilelang_ops/cuda/kernel.py"
            path.parent.mkdir(parents=True)
            path.write_text("def kernel(): pass", encoding="utf-8")
            graph = extract_repository(root, with_timestamp=False)
            self.assertEqual(graph["files"][0]["district"], "deepinfer/model_executor/layers/tilelang_ops/cuda")
            self.assertEqual(graph["districts"][0]["files"], [path.relative_to(root).as_posix()])
            self.assertIn("CUDA", graph["districts"][0]["description"]["title"])

    def test_prefixed_package_resolution_still_works(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "__init__.py").write_text("", encoding="utf-8")
            (root / "a.py").write_text("import sglang.srt\nfrom sglang.srt import b", encoding="utf-8")
            (root / "b.py").write_text("VALUE = 1", encoding="utf-8")
            graph = extract(root, "python/sglang/srt", "sglang.srt", False)
            self.assertEqual({(edge["from"], edge["to"]) for edge in graph["imports"]}, {("a.py", "__init__.py"), ("a.py", "b.py")})


if __name__ == "__main__":
    unittest.main()
