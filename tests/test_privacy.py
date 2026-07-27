import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_PARTS = {".git", ".build-deps", "node_modules", "__pycache__", ".next"}

# These markers represent private project context that must never ship in the
# reusable open-source repository. Keep this list local to the repository.
PRIVATE_MARKERS = (
    "WAKA",
    "女包",
    "小红书",
    "云艺",
    "150 个",
    "150个",
    "库存盘点",
    "土豆丝",
)


class RepositoryPrivacyTests(unittest.TestCase):
    def test_private_project_markers_are_absent(self):
        violations = []
        text_suffixes = {
            ".md",
            ".json",
            ".py",
            ".ts",
            ".tsx",
            ".js",
            ".mjs",
            ".css",
            ".yml",
            ".yaml",
            ".txt",
        }
        for path in ROOT.rglob("*"):
            if not path.is_file():
                continue
            if any(part in EXCLUDED_PARTS for part in path.parts):
                continue
            if path.suffix.lower() not in text_suffixes:
                continue
            content = path.read_text(encoding="utf-8")
            for marker in PRIVATE_MARKERS:
                if marker in content and path != Path(__file__):
                    violations.append(f"{path.relative_to(ROOT)}: {marker}")
        self.assertEqual(violations, [], "\n".join(violations))


if __name__ == "__main__":
    unittest.main()
