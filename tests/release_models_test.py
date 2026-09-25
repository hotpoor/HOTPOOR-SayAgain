import hashlib
import importlib.util
import io
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('release_models', Path(__file__).resolve().parents[1] / 'skills/sayagain/scripts/download-release-models.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def record(data):
    return {'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


class ModelDownloadTests(unittest.TestCase):
    def test_http_resume_and_checksum(self):
        content = b'0123456789' * 20
        observed = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                observed.append(self.headers.get('Range'))
                offset = int(self.headers.get('Range', 'bytes=0-')[6:-1])
                self.send_response(206 if offset else 200)
                self.send_header('Content-Length', str(len(content) - offset))
                if offset:
                    self.send_header('Content-Range', f'bytes {offset}-{len(content)-1}/{len(content)}')
                self.end_headers()
                self.wfile.write(content[offset:])

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                cache = Path(directory)
                (cache / 'fixture.zip.part').write_bytes(content[:30])
                asset = {'name': 'fixture.zip', **record(content),
                         'url': f'http://127.0.0.1:{server.server_port}/fixture.zip'}
                target = module.download(asset, cache, False)
                self.assertEqual(target.read_bytes(), content)
                self.assertEqual(observed, ['bytes=30-'])
                self.assertEqual(module.download(asset, cache, True), target)
                self.assertEqual(len(observed), 1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def fixture(self, root, name='model.onnx', split=False):
        cache = root / 'cache'
        destination = root / 'models'
        cache.mkdir()
        destination.mkdir()
        data = b'test model bytes'
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr(name, data)
        blob = buffer.getvalue()
        chunks = [blob[:30], blob[30:]] if split else [blob]
        assets = []
        for index, chunk in enumerate(chunks):
            filename = f'asset-{index}.zip'
            (cache / filename).write_bytes(chunk)
            assets.append({'name': filename, **record(chunk), 'url': 'https://invalid.example/' + filename})
        model = {'archive_size': len(blob), 'archive_sha256': record(blob)['sha256'], 'assets': assets,
                 'files': [{'path': name, **record(data)}]}
        return cache, destination, model

    def test_split_archive_extract_and_reuse_without_runtime_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = root / 'runtime.json'
            runtime.write_bytes(b'original runtime')
            cache, destination, model = self.fixture(root, split=True)
            target = module.install('fixture', model, destination, cache, True)
            self.assertEqual((target / 'model.onnx').read_bytes(), b'test model bytes')
            self.assertEqual(module.install('fixture', model, destination, cache, True), target)
            self.assertEqual(runtime.read_bytes(), b'original runtime')
            (target / 'model.onnx').write_bytes(b'user changed')
            with self.assertRaisesRegex(ValueError, 'Existing model differs'):
                module.install('fixture', model, destination, cache, True)
            self.assertEqual((target / 'model.onnx').read_bytes(), b'user changed')

    def test_corrupt_asset_never_creates_model(self):
        with tempfile.TemporaryDirectory() as directory:
            cache, destination, model = self.fixture(Path(directory))
            (cache / model['assets'][0]['name']).write_bytes(b'bad')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                module.install('fixture', model, destination, cache, True)
            self.assertFalse((destination / 'fixture').exists())

    def test_traversal_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            cache, destination, model = self.fixture(Path(directory), '../escape')
            with self.assertRaisesRegex(ValueError, 'Unsafe'):
                module.install('fixture', model, destination, cache, True)
            self.assertFalse((destination / 'escape').exists())

    def test_member_hash_checked_after_archive_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            cache, destination, model = self.fixture(Path(directory))
            model['files'][0]['sha256'] = '0' * 64
            with self.assertRaisesRegex(ValueError, 'Extracted file checksum'):
                module.install('fixture', model, destination, cache, True)
            self.assertFalse((destination / 'fixture').exists())


if __name__ == '__main__':
    unittest.main()
