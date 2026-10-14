"""Package a source-only Cloud Shell owner portal; never reads local SDK or auth files."""
from pathlib import Path
import hashlib
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'start.sh': 'scripts/owner-setup/start.sh',
    'README_AR.md': 'scripts/owner-setup/README_AR.md',
    'functions/package.json': 'functions/package.json',
    'functions/package-lock.json': 'functions/package-lock.json',
    'functions/scripts/owner_google_setup.js': 'functions/scripts/owner_google_setup.js',
    'functions/scripts/read_cloud_inventory.js': 'functions/scripts/read_cloud_inventory.js',
    'functions/scripts/google_read.js': 'functions/scripts/google_read.js',
    'functions/scripts/bootstrap_admin.js': 'functions/scripts/bootstrap_admin.js',
    'functions/src/bootstrap_google.js': 'functions/src/bootstrap_google.js',
    'functions/src/google_identity.js': 'functions/src/google_identity.js',
}


def main():
    destination = ROOT / 'build/owner-setup/velnix-owner-setup.zip'
    destination.parent.mkdir(parents=True, exist_ok=True)
    checksums = []
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, source in FILES.items():
            data = (ROOT / source).read_bytes()
            archive.writestr('velnix-owner-setup/' + name, data)
            checksums.append(hashlib.sha256(data).hexdigest() + '  ' + name)
        archive.writestr('velnix-owner-setup/MANIFEST.sha256', '\n'.join(checksums) + '\n')
    print(destination)
    print('SHA256 ' + hashlib.sha256(destination.read_bytes()).hexdigest())


if __name__ == '__main__':
    main()
