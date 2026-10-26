"""Fail on credential files or common secret signatures; print locations only."""
import re
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
patterns = {
    'private key': rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    'Google API key': rb'AIza[0-9A-Za-z_-]{35}',
    'GitHub token': rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})',
    'AWS key': rb'AKIA[0-9A-Z]{16}',
    'service account': rb'"type"\s*:\s*"service_account"',
}
files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
findings = []
for name in filter(None, files):
    path = root / name
    if not path.is_file():
        continue
    if re.search(r'(service[-_]account.*\.json|google-services\.json|GoogleService-Info\.plist|firebase\.public\.json|\.jks$|\.keystore$|(?:^|/)\.env(?:\.|$))', name, re.I) and not name.endswith('.env.example'):
        findings.append((name, 'credential filename'))
    data = path.read_bytes()
    for label, pattern in patterns.items():
        if re.search(pattern, data):
            findings.append((name, label))
for location, kind in findings:
    print(f'{location}: {kind}', file=sys.stderr)
print(f'Secret signature check: {len(list(filter(None, files)))} tracked files, {len(findings)} findings')
raise SystemExit(bool(findings))
