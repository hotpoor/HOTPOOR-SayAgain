"""Rebuild one pinned model archive and optionally upload verified Release assets."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024**2), b''):
            h.update(block)
    return h.hexdigest()


def fetch(url, target):
    with urllib.request.urlopen(url, timeout=120) as source, target.open('wb') as output:
        shutil.copyfileobj(source, output, 4 * 1024**2)


def gh(*args):
    return subprocess.check_output(['gh', *args], text=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--local-archives', type=Path)
    parser.add_argument('--upload', action='store_true')
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'skills/sayagain/assets/model-manifest.json').read_text(encoding='utf-8'))
    recipes = json.loads((ROOT / 'scripts/release-model-recipe.json').read_text(encoding='utf-8'))
    model, recipe = manifest['models'][args.model], recipes[args.model]
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    archive = output / (args.model + '.zip')
    if archive.exists():
        raise FileExistsError('Use a fresh build output: ' + str(archive))
    source_archive = None
    local_archive = None
    if args.local_archives:
        local_archive = zipfile.ZipFile(args.local_archives / archive.name)
    elif recipe['source_archive']:
        src = recipe['source_archive']
        target = output / 'upstream.archive'
        fetch(src['url'], target)
        source_archive = zipfile.ZipFile(target) if src['format'] == 'zip' else tarfile.open(target)
    expected = {f['path']: f for f in model['files']}
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_STORED, allowZip64=True) as zipped:
        for entry in recipe['entries']:
            name = entry['path']
            record = expected[name]
            if local_archive:
                source = local_archive.open(name)
            elif 'text' in entry:
                source = io.BytesIO(entry['text'].encode('utf-8'))
            elif 'archive_member' in entry:
                source = (source_archive.open(entry['archive_member']) if isinstance(source_archive, zipfile.ZipFile)
                          else source_archive.extractfile(entry['archive_member']))
            else:
                source = urllib.request.urlopen(entry['url'], timeout=120)
            info = zipfile.ZipInfo(name, tuple(entry['date_time']))
            for field in ['external_attr', 'create_system', 'create_version', 'extract_version']:
                setattr(info, field, entry[field])
            info.file_size = record['size']
            checksum = hashlib.sha256()
            count = 0
            with source, zipped.open(info, 'w', force_zip64=info.file_size * 1.05 > zipfile.ZIP64_LIMIT) as target:
                while True:
                    block = source.read(4 * 1024**2)
                    if not block:
                        break
                    count += len(block)
                    if count > record['size']:
                        raise ValueError('Source larger than manifest: ' + name)
                    checksum.update(block)
                    target.write(block)
            assert count == record['size'] and checksum.hexdigest() == record['sha256'], name
    if source_archive:
        source_archive.close()
    if local_archive:
        local_archive.close()
    assert archive.stat().st_size == model['archive_size'], 'Archive size mismatch'
    assert digest(archive) == model['archive_sha256'], 'Archive SHA256 mismatch'
    paths = []
    if len(model['assets']) == 1:
        paths = [archive]
    else:
        with archive.open('rb') as source:
            for asset in model['assets']:
                target = output / asset['name']
                remaining = asset['size']
                with target.open('xb') as dest:
                    while remaining:
                        block = source.read(min(4 * 1024**2, remaining))
                        if not block:
                            raise ValueError('Unexpected archive end')
                        dest.write(block)
                        remaining -= len(block)
                paths.append(target)
    for path, asset in zip(paths, model['assets']):
        assert path.name == asset['name'] and path.stat().st_size == asset['size']
        assert digest(path) == asset['sha256'], path.name
    print('Reproduced exact archive and asset hashes: ' + args.model, flush=True)
    if args.upload:
        repo = 'hotpoor/HOTPOOR-SayAgain'
        release = json.loads(gh('api', f'repos/{repo}/releases/tags/{manifest["release"]}'))
        assert release['draft'], 'Only upload into a draft Release'
        existing = {a['name']: a for a in release['assets']}
        for path, asset in zip(paths, model['assets']):
            previous = existing.get(path.name)
            if previous and previous['state'] == 'starter':
                gh('api', '--method', 'DELETE', f'repos/{repo}/releases/assets/{previous["id"]}')
                previous = None
            if previous:
                assert previous['size'] == asset['size'] and previous.get('digest') == 'sha256:' + asset['sha256'], path.name
            else:
                subprocess.run(['gh', 'release', 'upload', manifest['release'], str(path), '--repo', repo], check=True)
        release = json.loads(gh('api', f'repos/{repo}/releases/{release["id"]}'))
        uploaded = {a['name']: a for a in release['assets']}
        for asset in model['assets']:
            actual = uploaded[asset['name']]
            assert actual['state'] == 'uploaded' and actual['size'] == asset['size']
            assert actual.get('digest') == 'sha256:' + asset['sha256'], asset['name']
        print('All uploaded model assets verified against GitHub SHA256', flush=True)


if __name__ == '__main__':
    main()
