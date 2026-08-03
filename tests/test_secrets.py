import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SELF = Path(__file__).resolve()
EXCLUDED_PARTS = {
    ".git",
    ".build-deps",
    "node_modules",
    "__pycache__",
    ".next",
    ".wrangler",
    "dist",
}
TEXT_SUFFIXES = {
    ".css",
    ".env",
    ".example",
    ".html",
    ".js",
    ".json",
    ".md",
    ".mjs",
    ".py",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}
SECRET_PATTERNS = {
    "OpenAI-style API key": re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    "GitHub token": re.compile(
        r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b"
    ),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "Google API key": re.compile(r"\bAIza[0-9A-Za-z_-]{30,}\b"),
    "Slack token": re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b"),
    "Private key": re.compile(
        r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"
    ),
    "JWT-like token": re.compile(
        r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"
    ),
}


def should_scan(relative_path: Path) -> bool:
    if any(part in EXCLUDED_PARTS for part in relative_path.parts):
        return False
    if relative_path.as_posix() == "tests/test_secrets.py":
        return False
    return relative_path.suffix.lower() in TEXT_SUFFIXES


def find_secrets(text: str):
    return [
        label for label, pattern in SECRET_PATTERNS.items() if pattern.search(text)
    ]


class RepositorySecretTests(unittest.TestCase):
    def test_current_tree_has_no_high_confidence_secrets(self):
        violations = []
        for path in ROOT.rglob("*"):
            if not path.is_file() or path.resolve() == SELF:
                continue
            relative = path.relative_to(ROOT)
            if not should_scan(relative) or path.stat().st_size > 5_000_000:
                continue
            try:
                content = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            for label in find_secrets(content):
                violations.append(f"{relative.as_posix()}: {label}")
        self.assertEqual(violations, [], "\n".join(violations))

    def test_git_history_has_no_high_confidence_secrets(self):
        commits = subprocess.run(
            ["git", "rev-list", "--all"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.splitlines()
        violations = []
        for commit in commits:
            paths = subprocess.run(
                ["git", "ls-tree", "-r", "--name-only", commit],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            ).stdout.splitlines()
            for raw_path in paths:
                relative = Path(raw_path)
                if not should_scan(relative):
                    continue
                result = subprocess.run(
                    ["git", "show", f"{commit}:{raw_path}"],
                    cwd=ROOT,
                    check=False,
                    capture_output=True,
                )
                if result.returncode != 0 or len(result.stdout) > 5_000_000:
                    continue
                content = result.stdout.decode("utf-8", errors="ignore")
                for label in find_secrets(content):
                    violations.append(
                        f"{commit[:12]}:{relative.as_posix()}: {label}"
                    )
        self.assertEqual(violations, [], "\n".join(violations))


if __name__ == "__main__":
    unittest.main()
