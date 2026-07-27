import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "potatoflow" / "scripts" / "potatoflow.py"
SPEC = importlib.util.spec_from_file_location("potatoflow_cli", SCRIPT)
potatoflow = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(potatoflow)


class PotatoFlowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name) / "data.json"
        self.plan = ROOT / "examples" / "sample-plan.example.json"

    def tearDown(self):
        self.temp.cleanup()

    def import_example(self):
        args = SimpleNamespace(data=str(self.data), input=str(self.plan))
        return potatoflow.command_import_plan(args)

    def test_new_store_is_empty(self):
        result = potatoflow.command_init(
            SimpleNamespace(data=str(self.data), force=False)
        )
        self.assertTrue(result["ok"])
        stored = json.loads(self.data.read_text(encoding="utf-8"))
        self.assertEqual(stored["projects"], [])
        self.assertEqual(stored["tasks"], [])
        self.assertEqual(stored["issues"], [])
        self.assertEqual(stored["events"], [])

    def test_example_plan_is_valid(self):
        result = potatoflow.validate_plan(
            json.loads(self.plan.read_text(encoding="utf-8"))
        )
        self.assertTrue(result["valid"])
        self.assertEqual(result["task_count"], 2)

    def test_skill_metadata_is_utf8(self):
        metadata = (
            ROOT / "skills" / "potatoflow" / "agents" / "openai.yaml"
        ).read_text(encoding="utf-8")
        self.assertIn("PotatoFlow 项目执行系统", metadata)
        self.assertNotIn("\ufffd", metadata)

    def test_import_and_today(self):
        result = self.import_example()
        self.assertEqual(result["tasks_created"], 2)
        today = potatoflow.command_today(
            SimpleNamespace(data=str(self.data), date="2026-07-28")
        )
        self.assertEqual(len(today["tasks"]), 1)
        self.assertEqual(today["tasks"][0]["id"], "task-define-catalog")

    def test_issue_and_context(self):
        self.import_example()
        issue_result = potatoflow.command_record_issue(
            SimpleNamespace(
                data=str(self.data),
                task_id="task-define-catalog",
                question="字段名称出现重复怎么办？",
                attempt=["检查了表头"],
                block=True,
            )
        )
        self.assertEqual(issue_result["task_status"], "blocked")
        context = potatoflow.command_context(
            SimpleNamespace(data=str(self.data), task_id="task-define-catalog")
        )
        self.assertEqual(len(context["issues"]), 1)
        self.assertEqual(context["project"]["id"], "project-sample-research-project")

    def test_answer_and_resolve_issue(self):
        self.import_example()
        issue = potatoflow.command_record_issue(
            SimpleNamespace(
                data=str(self.data),
                task_id="task-define-catalog",
                question="怎么避免重复字段？",
                attempt=[],
                block=False,
            )
        )["issue"]
        answered = potatoflow.command_answer_issue(
            SimpleNamespace(
                data=str(self.data),
                issue_id=issue["id"],
                response="先统一字段命名规则，再做重复值校验。",
                response_file=None,
            )
        )
        self.assertEqual(answered["issue"]["status"], "answered")
        resolved = potatoflow.command_resolve_issue(
            SimpleNamespace(
                data=str(self.data),
                issue_id=issue["id"],
                verification="重新检查后没有重复字段",
            )
        )
        self.assertEqual(resolved["issue"]["status"], "resolved")

    def test_rejects_unknown_dependency(self):
        plan = json.loads(self.plan.read_text(encoding="utf-8"))
        plan["tasks"][0]["dependencies"] = ["missing"]
        with self.assertRaises(potatoflow.PotatoFlowError):
            potatoflow.validate_plan(plan)


if __name__ == "__main__":
    unittest.main()
