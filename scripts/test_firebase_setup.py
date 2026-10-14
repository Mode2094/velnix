"""Contract checks use synthetic SDK data only; no Firebase network access."""
import copy
import json
import plistlib
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from prepare_firebase_config import configurations, prepare


def fixtures():
    key = 'AIza' + 'A' * 35
    client = {'client_info': {'mobilesdk_app_id': '1:123:android:fixture',
                             'android_client_info': {'package_name': 'com.mode2094.velnix'}},
              'api_key': [{'current_key': key}], 'oauth_client': []}
    android = {'project_info': {'project_id': 'fixture-project', 'project_number': '123',
                               'storage_bucket': 'fixture-bucket'}, 'client': [client]}
    ios = {'PROJECT_ID': 'fixture-project', 'GCM_SENDER_ID': '123', 'BUNDLE_ID': 'com.mode2094.velnix',
           'GOOGLE_APP_ID': '1:123:ios:fixture', 'API_KEY': key, 'STORAGE_BUCKET': 'fixture-bucket',
           'CLIENT_ID': '123-fixture.apps.googleusercontent.com',
           'REVERSED_CLIENT_ID': 'com.googleusercontent.apps.123-fixture'}
    web = {'projectId': 'fixture-project', 'messagingSenderId': '123', 'storageBucket': 'fixture-bucket',
           'appId': '1:123:web:fixture', 'apiKey': key, 'authDomain': 'fixture.example'}
    return android, ios, web


class FirebaseSetupTest(unittest.TestCase):
    def check(self, sources):
        return configurations(*sources, project='fixture-project', bundle='com.mode2094.velnix')

    def test_platform_specific_options_share_one_project(self):
        configs, reverse = self.check(fixtures())
        self.assertEqual(len({c['FIREBASE_APP_ID'] for c in configs.values()}), 3)
        self.assertEqual({c['FIREBASE_PROJECT_ID'] for c in configs.values()}, {'fixture-project'})
        self.assertEqual(reverse, 'com.googleusercontent.apps.123-fixture')
        for c in configs.values():
            self.assertFalse(c['VELNIX_GOOGLE_ENABLED'])
            self.assertFalse(c['VELNIX_PUSH_ENABLED'])

    def test_mixed_project_sender_app_and_bundle_rejected(self):
        for field, value in [('PROJECT_ID', 'other-project'), ('GCM_SENDER_ID', '999'),
                             ('GOOGLE_APP_ID', '1:123:web:wrong'), ('BUNDLE_ID', 'other.bundle'),
                             ('STORAGE_BUCKET', 'wrong-bucket')]:
            sources = fixtures()
            sources[1][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.check(sources)

    def test_private_fields_and_ambiguous_android_rejected(self):
        sources = fixtures()
        sources[2]['private_key'] = 'never-public'
        with self.assertRaises(ValueError):
            self.check(sources)
        sources = fixtures()
        sources[0]['client'].append(copy.deepcopy(sources[0]['client'][0]))
        with self.assertRaises(ValueError):
            self.check(sources)

    def test_malformed_ios_oauth_scheme_rejected(self):
        sources = fixtures()
        sources[1]['REVERSED_CLIENT_ID'] = 'injected\nSETTING = bad'
        with self.assertRaises(ValueError):
            self.check(sources)

    def test_prepare_preserves_public_keys_and_refuses_registration_replacement(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sources = fixtures()
            a, i, w = root/'a.json', root/'i.plist', root/'w.json'
            a.write_text(json.dumps(sources[0]));i.write_bytes(plistlib.dumps(sources[1]));w.write_text(json.dumps(sources[2]))
            kwargs = {'project': 'fixture-project', 'bundle': 'com.mode2094.velnix'}
            prepare(root, a, i, w, **kwargs)
            web_file = root/'config/firebase.web.public.json'
            data = json.loads(web_file.read_text());data['FIREBASE_APPCHECK_SITE_KEY'] = 'public-check-key'
            web_file.write_text(json.dumps(data))
            prepare(root, a, i, w, **kwargs)
            self.assertEqual(json.loads(web_file.read_text())['FIREBASE_APPCHECK_SITE_KEY'], 'public-check-key')
            self.assertEqual((root/'ios/Runner/GoogleService-Info.plist').read_bytes(), i.read_bytes())
            data['FIREBASE_APP_ID'] = '1:123:web:different';web_file.write_text(json.dumps(data))
            with self.assertRaises(ValueError):
                prepare(root, a, i, w, **kwargs)
            self.assertEqual(json.loads(web_file.read_text())['FIREBASE_APP_ID'], '1:123:web:different')

    def test_invalid_sources_write_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            a, i, w = root/'a.json', root/'i.plist', root/'w.json'
            sources = fixtures(); sources[2]['appId'] = '1:123:ios:wrong'
            a.write_text(json.dumps(sources[0]));i.write_bytes(plistlib.dumps(sources[1]));w.write_text(json.dumps(sources[2]))
            with self.assertRaises(ValueError):
                prepare(root, a, i, w, project='fixture-project', bundle='com.mode2094.velnix')
            self.assertFalse((root/'config').exists())

    def test_ios_copy_phase_removes_stale_sdk_file_when_demo_has_no_config(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root/'build/Runner.app/GoogleService-Info.plist'
            destination.parent.mkdir(parents=True)
            destination.write_text('old-project SDK file')
            env = {**os.environ, 'PROJECT_DIR': str(root/'ios'),
                   'TARGET_BUILD_DIR': str(root/'build'),
                   'UNLOCALIZED_RESOURCES_FOLDER_PATH': 'Runner.app'}
            script = Path(__file__).resolve().parents[1]/'ios/scripts/copy_firebase_config.sh'
            subprocess.run(['sh', str(script)], env=env, check=True)
            self.assertFalse(destination.exists())


if __name__ == '__main__':
    unittest.main()
