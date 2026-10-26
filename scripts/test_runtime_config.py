"""Regression checks for configuration boundary mistakes, entirely offline."""
import json
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

    def test_production_enterprise_config_and_missing_key(self):
        data = {**config(), "VELNIX_ENVIRONMENT": "production", "VELNIX_GOOGLE_ENABLED": True}
        validate(data, environment="production", platform="web", expected_project="velnix-fixture")
        for value in ["", "   "]:
            with self.assertRaisesRegex(ValueError, "Enterprise"):
                validate({**data, "FIREBASE_APPCHECK_SITE_KEY": value}, environment="production",
                         platform="web", expected_project="velnix-fixture")
        with self.assertRaises(ValueError):
            validate({**data, "VELNIX_DEBUG_APPCHECK": True}, environment="production",
                     platform="web", expected_project="velnix-fixture", release=False)

    def test_hosting_is_default_site_spa_and_cannot_include_other_resources(self):
        root = Path(__file__).resolve().parents[1]
        target = json.loads((root / "firebase.hosting.json").read_text())
        self.assertEqual(set(target), {"hosting"})
        hosting = target["hosting"]
        self.assertEqual(set(hosting), {"site", "public", "ignore", "rewrites", "headers"})
        self.assertEqual(hosting["site"], "velnix-6c1a2")
        self.assertEqual(hosting["public"], "build/web")
        self.assertEqual(hosting["rewrites"], [{"source": "**", "destination": "/index.html"}])
        self.assertIn("**/.*", hosting["ignore"])
        for rule in hosting["headers"]:
            self.assertEqual(set(rule), {"source", "headers"})
            self.assertTrue(rule["source"].startswith("/"))
            for header in rule["headers"]:
                self.assertEqual(set(header), {"key", "value"})
                self.assertEqual(header["key"], "Cache-Control")
        main = (root / "lib/main.dart").read_text()
        self.assertNotIn("ReCaptchaV3Provider", main)
        self.assertIn("FirebaseConfiguration.webAppCheckProvider(webSiteKey)", main)

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
