import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_PARTS = {".git", ".build-deps", "node_modules", "__pycache__", ".next"}

# Keep real private markers in the ignored `.privacy-markers.local.txt`, one
# per line. The public test ships only neutral leak sentinels.
PRIVATE_MARKERS = (
    "REPLACE_WITH_PRIVATE_BRAND",
    "REPLACE_WITH_PRIVATE_ACCOUNT",
    "REPLACE_WITH_PRIVATE_PATH",
)
LOCAL_MARKERS_FILE = ROOT / ".privacy-markers.local.txt"
if LOCAL_MARKERS_FILE.exists():
    PRIVATE_MARKERS += tuple(
        line.strip()
        for line in LOCAL_MARKERS_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
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
            if path.resolve() == Path(__file__).resolve():
                continue
            if any(part in EXCLUDED_PARTS for part in path.parts):
                continue
            if path.suffix.lower() not in text_suffixes:
                continue
            content = path.read_text(encoding="utf-8")
            for marker in PRIVATE_MARKERS:
                if marker in content:
                    violations.append(f"{path.relative_to(ROOT)}: {marker}")
        self.assertEqual(violations, [], "\n".join(violations))


if __name__ == "__main__":
    unittest.main()
