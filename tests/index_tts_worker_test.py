"""Adapter contract tests use a fake inference class, no models/network or torch."""
import importlib.util
import contextlib
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import wave

spec = importlib.util.spec_from_file_location('index_worker', Path(__file__).parents[1] / 'workers/index_tts_worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class WorkerContract(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.reference = self.root / 'reference.wav'
        self.reference.write_bytes(b'reference fixture')
        self.request = dict(reference_path=str(self.reference), output_path=str(self.root / 'output.wav'),
                            model_path=str(self.root / 'model'), text='这是正确的台词。', language='Chinese', device='cpu',
                            emotion_vector=[0.8, 0, 0, 0, 0, 0, 0, 0], emotion_intensity=0.5)
        self.inference_active = False
        self.memory_limits = []
        @contextlib.contextmanager
        def inference_mode():
            self.inference_active = True
            try:
                yield
            finally:
                self.inference_active = False
        self.torch = SimpleNamespace(inference_mode=inference_mode, mps=SimpleNamespace(
            recommended_max_memory=lambda: 48 * 1024 ** 3,
            set_per_process_memory_fraction=self.memory_limits.append))
        self.patch = patch.dict(sys.modules, torch=self.torch)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_official_api_gets_unscaled_vector_and_separate_alpha(self):
        calls = {}
        owner = self
        class FakeIndexTTS2:
            def __init__(self, **kwargs):
                owner.assertTrue(owner.inference_active)
                calls['constructor'] = kwargs
            def infer(self, spk_audio_prompt, text, output_path, lang, emo_vector, emo_alpha,
                      use_emo_text, use_random, verbose):
                owner.assertTrue(owner.inference_active)
                calls['infer'] = dict(spk_audio_prompt=spk_audio_prompt, text=text, lang=lang,
                                     emo_vector=emo_vector, emo_alpha=emo_alpha, use_emo_text=use_emo_text, use_random=use_random)
                with wave.open(output_path, 'wb') as audio:
                    audio.setnchannels(1)
                    audio.setsampwidth(2)
                    audio.setframerate(22050)
                    audio.writeframes(b'\0\0' * 200)
        result = worker.synthesize(self.request, FakeIndexTTS2)
        self.assertEqual(result['sample_rate'], 22050)
        self.assertEqual(calls['infer']['text'], self.request['text'])
        self.assertEqual(calls['infer']['lang'], 'ZH')
        self.assertEqual(calls['infer']['spk_audio_prompt'], str(self.reference))
        self.assertEqual(calls['infer']['emo_vector'][0], 0.8)
        self.assertEqual(calls['infer']['emo_alpha'], 0.5)
        self.assertFalse(calls['infer']['use_emo_text'])
        self.assertFalse(calls['constructor']['use_qwen_emo'])
        self.assertEqual(calls['constructor']['cfg_path'], str(self.root / 'model/config.yaml'))
        self.assertFalse(self.inference_active)
        self.assertEqual(self.memory_limits, [])

    def test_mps_bounds_memory_and_segments_without_changing_text_or_emotion(self):
        calls = {}
        owner = self
        class FakeIndexTTS2:
            def __init__(self, **kwargs):
                owner.assertEqual(owner.memory_limits, [0.25])
                owner.assertTrue(owner.inference_active)
            def infer(self, **kwargs):
                calls.update(kwargs)
                owner.assertTrue(owner.inference_active)
                with wave.open(kwargs['output_path'], 'wb') as audio:
                    audio.setnchannels(1)
                    audio.setsampwidth(2)
                    audio.setframerate(22050)
                    audio.writeframes(b'\0\0' * 200)
        worker.synthesize(dict(self.request, device='mps'), FakeIndexTTS2)
        self.assertEqual(calls['text'], self.request['text'])
        self.assertEqual(calls['emo_vector'], self.request['emotion_vector'])
        self.assertEqual(calls['emo_alpha'], self.request['emotion_intensity'])
        self.assertEqual(calls['max_text_tokens_per_segment'], 40)
        self.assertEqual(calls['num_beams'], 1)

    def test_output_cannot_destroy_reference(self):
        self.request['output_path'] = str(self.reference)
        with self.assertRaisesRegex(ValueError, 'overwrite'):
            worker.request_parameters(self.request)
        self.assertEqual(self.reference.read_bytes(), b'reference fixture')

    def test_emotion_mixture_total_is_bounded_before_intensity(self):
        self.request['emotion_vector'] = [0.5, 0.5, 0, 0, 0, 0, 0, 0]
        self.assertEqual(worker.request_parameters(self.request)['emo_vector'], self.request['emotion_vector'])
        self.request['emotion_vector'] = [0.8, 0.5, 0, 0, 0, 0, 0, 0]
        self.request['emotion_intensity'] = 0.1
        with self.assertRaisesRegex(ValueError, '情绪配比总和不能超过 100%'):
            worker.request_parameters(self.request)

    def test_validation_rejects_bad_vectors_and_language(self):
        for field, value in [('emotion_vector', [True] * 8), ('emotion_vector', [float('nan')] * 8),
                             ('emotion_vector', [1, 0]), ('emotion_intensity', -0.1), ('language', 'de')]:
            with self.assertRaises(ValueError):
                worker.request_parameters(dict(self.request, **{field: value}))

    def test_network_guard_rejects_downloads(self):
        with self.assertRaisesRegex(RuntimeError, 'offline'):
            worker.forbid_network('socket.connect', ())


if __name__ == '__main__':
    result = unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(WorkerContract))
    if not result.wasSuccessful():
        raise SystemExit(1)
    print('worker-contract-ok')
