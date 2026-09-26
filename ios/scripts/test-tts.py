#!/usr/bin/env python3
"""Run the real Swift TTS client with mocked URLs and temporary local storage."""
import pathlib, subprocess, tempfile
root = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='sayagain-tts-tests-') as folder:
    source = pathlib.Path(folder) / 'main.swift'
    source.write_text('\n'.join((root / name).read_text() for name in ['SayAgain/Preferences.swift', 'SayAgain/Model.swift', 'SayAgain/QwenTTS.swift', 'scripts/tts-tests.swift']))
    subprocess.run(['swift', '-swift-version', '5', str(source)], check=True)
