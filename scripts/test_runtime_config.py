"""Regression checks for configuration boundary mistakes, entirely offline."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from check_runtime_config import validate


def config():
    return {"VELNIX_ENVIRONMENT": "staging", "VELNIX_MODE": "live",
            "VELNIX_DEBUG_APPCHECK": False, "VELNIX_GOOGLE_ENABLED": False,
            "VELNIX_PUSH_ENABLED": False, "FIREBASE_PROJECT_ID": "velnix-fixture",
            "FIREBASE_API_KEY": "AIza" + "A" * 35, "FIREBASE_APP_ID": "1:123:web:fixture",
            "FIREBASE_SENDER_ID": "123", "FIREBASE_AUTH_DOMAIN": "fixture.example",
            "FIREBASE_APPCHECK_SITE_KEY": "public-site-key"}


class ConfigSafetyTest(unittest.TestCase):
    def check(self, data, **kwargs):
        validate(data, environment="staging", platform="web", expected_project="velnix-fixture", **kwargs)

    def test_valid_public_target(self):
        self.check(config())

    def test_wrong_environment_project_demo_and_secret_fields(self):
        for change in [{"VELNIX_MODE": "demo"}, {"VELNIX_ENVIRONMENT": "production"},
                       {"FIREBASE_PROJECT_ID": "wrong-project"}, {"User_Pass": "never-public"},
                       {"private_key": "never-public"}, {"VELNIX_PUSH_ENABLED": "false"}]:
            with self.subTest(change=list(change)):
                with self.assertRaises(ValueError):
                    self.check({**config(), **change})

    def test_platform_and_push_requirements(self):
        for change in [{"FIREBASE_APP_ID": "1:999:web:fixture"},
                       {"FIREBASE_APPCHECK_SITE_KEY": ""}, {"VELNIX_PUSH_ENABLED": True}]:
            with self.assertRaises(ValueError):
                self.check({**config(), **change})

    def test_debug_provider_and_demo_project_not_production(self):
        self.check({**config(), "VELNIX_DEBUG_APPCHECK": True}, release=False)
        with self.assertRaises(ValueError):
            self.check({**config(), "VELNIX_DEBUG_APPCHECK": True})
        with self.assertRaises(ValueError):
            validate({**config(), "VELNIX_ENVIRONMENT": "production", "FIREBASE_PROJECT_ID": "demo-velnix"},
                     environment="production", platform="web", expected_project="demo-velnix")

    def test_cli_failure_does_not_echo_private_input(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "private.json"
            sentinel = "SENSITIVE_INPUT_MUST_NOT_APPEAR"
            path.write_text(sentinel)
            result = subprocess.run([sys.executable, str(Path(__file__).with_name("check_runtime_config.py")), str(path),
                                     "--environment", "staging", "--platform", "web", "--expected-project", "fixture"],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn(sentinel, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
