"""Download pinned Release models without installing dependencies or registering runtimes."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile
import urllib.request
import zipfile


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(4 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def matches(path, record):
    return (path.is_file() and not path.is_symlink()
            and path.stat().st_size == record['size']
            and sha256(path) == record['sha256'])


def safe_relative(name):
    path = PurePosixPath(name)
    if (not name or path.is_absolute() or '..' in path.parts
            or '\\' in name or ':' in name or str(path) != name):
        raise ValueError('Unsafe archive/manifest path: ' + name)
    return path


def download(asset, cache, offline):
    name = asset['name']
    if safe_relative(name).name != name:
        raise ValueError('Asset must have a flat filename')
    target = cache / name
    if matches(target, asset):
        return target
    if target.exists():
        raise ValueError('Existing cache file failed checksum; inspect it: ' + str(target))
    if offline:
        raise FileNotFoundError('Missing verified offline asset: ' + name)
    partial = cache / (name + '.part')
    if partial.is_symlink():
        raise ValueError('Refusing symlink: ' + str(partial))
    offset = partial.stat().st_size if partial.exists() else 0
    if offset == asset['size'] and matches(partial, asset):
        partial.rename(target)
        return target
    if offset >= asset['size']:
        raise ValueError('Invalid partial file; inspect it before retrying: ' + str(partial))
    request = urllib.request.Request(asset['url'], headers={'Range': f'bytes={offset}-'} if offset else {})
    with urllib.request.urlopen(request, timeout=120) as response:
        resume = offset > 0 and response.status == 206
        if resume and not response.headers.get('Content-Range', '').startswith(f'bytes {offset}-'):
            raise ValueError('Unexpected download range')
        received = offset if resume else 0
        with partial.open('ab' if resume else 'wb') as output:
            while True:
                block = response.read(4 * 1024 * 1024)
                if not block:
                    break
                received += len(block)
                if received > asset['size']:
                    raise ValueError('Download exceeds expected size')
                output.write(block)
    if not matches(partial, asset):
        raise ValueError('Download checksum mismatch: ' + name)
    partial.rename(target)
    return target


def install(key, model, destination, cache, offline=False):
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]*', key):
        raise ValueError('Invalid model identifier')
    target = destination / key
    expected = {}
    folded = set()
    for record in model['files']:
        name = str(safe_relative(record['path']))
        if name.casefold() in folded:
            raise ValueError('Duplicate model path')
        folded.add(name.casefold())
        expected[name] = record
    if target.exists():
        if target.is_symlink() or not target.is_dir():
            raise ValueError('Invalid existing model destination')
        for name, record in expected.items():
            file = target / name
            if not file.resolve().is_relative_to(target.resolve()) or not matches(file, record):
                raise ValueError('Existing model differs; choose a new directory: ' + str(target))
        print('Already verified: ' + str(target), flush=True)
        return target
    required = model['archive_size'] * 2 + sum(f['size'] for f in expected.values()) + 128 * 1024**2
    # Conservative per-volume check also covers cache and destination on the same volume.
    for folder in [destination, cache]:
        if shutil.disk_usage(folder).free < required:
            raise OSError('Insufficient free space at ' + str(folder))
    parts = [download(asset, cache, offline) for asset in model['assets']]
    if not parts:
        raise ValueError('No model assets')
    archive_record = {'size': model['archive_size'], 'sha256': model['archive_sha256']}
    archive = parts[0]
    if len(parts) > 1:
        archive = cache / (key + '.zip')
        if not matches(archive, archive_record):
            if archive.exists():
                raise ValueError('Existing assembled archive differs: ' + str(archive))
            temporary = cache / (key + '.zip.assembling')
            with temporary.open('xb') as output:
                for part in parts:
                    with part.open('rb') as source:
                        shutil.copyfileobj(source, output, 4 * 1024 * 1024)
            if not matches(temporary, archive_record):
                raise ValueError('Assembled archive checksum mismatch')
            temporary.rename(archive)
    if not matches(archive, archive_record):
        raise ValueError('Archive checksum mismatch')
    with zipfile.ZipFile(archive) as zipped:
        members = zipped.infolist()
        names = [str(safe_relative(member.filename)) for member in members]
        if len(names) != len(set(name.casefold() for name in names)) or set(names) != set(expected):
            raise ValueError('Archive contents do not match manifest')
        for member in members:
            if ((member.external_attr >> 16) & 0o170000) == 0o120000 or member.is_dir():
                raise ValueError('Unsupported archive member')
            if member.file_size != expected[member.filename]['size']:
                raise ValueError('Archive member size mismatch')
        with tempfile.TemporaryDirectory(prefix=key + '-', dir=destination) as staging_name:
            staging = Path(staging_name)
            for member in members:
                file = staging / member.filename
                file.parent.mkdir(parents=True, exist_ok=True)
                with zipped.open(member) as source, file.open('xb') as output:
                    shutil.copyfileobj(source, output, 4 * 1024 * 1024)
                if not matches(file, expected[member.filename]):
                    raise ValueError('Extracted file checksum mismatch: ' + member.filename)
            # Rename verified contents as one unit; never overwrite an existing model directory.
            if target.exists():
                raise FileExistsError(target)
            staging.rename(target)
    print('Downloaded and verified (not registered): ' + str(target), flush=True)
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--model', action='append', default=[])
    parser.add_argument('--models-dir', type=Path)
    parser.add_argument('--cache-dir', type=Path)
    parser.add_argument('--offline', action='store_true', help='Only use already downloaded, verified cache assets')
    args = parser.parse_args()
    manifest = json.loads((Path(__file__).parent.parent / 'assets/model-manifest.json').read_text(encoding='utf-8'))
    if args.list:
        for key, model in manifest['models'].items():
            print(f"{key}: {model['archive_size'] / 1024**2:.1f} MiB; {model['notes']}")
        return
    if not args.model or args.models_dir is None:
        parser.error('Specify --model (repeatable) and --models-dir; nothing is downloaded by default')
    unknown = set(args.model) - set(manifest['models'])
    if unknown:
        parser.error('Unknown model: ' + ', '.join(sorted(unknown)))
    destination = args.models_dir.resolve()
    cache = (args.cache_dir or destination / '.downloads').resolve()
    destination.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    # Prevent concurrent writes to shared .part/assembly files.
    lock = cache / '.sayagain-download.lock'
    descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        for key in dict.fromkeys(args.model):
            install(key, manifest['models'][key], destination, cache, args.offline)
    finally:
        os.close(descriptor)
        lock.unlink()


if __name__ == '__main__':
    main()
