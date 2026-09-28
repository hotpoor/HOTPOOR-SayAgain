import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]/'workers'))
from nemotron_pipeline import timeline, streaming_inputs


class TimelineTests(unittest.TestCase):
    def test_overlap_preserves_both_people_without_duplicate_audio(self):
        spans = timeline([{'Start':0,'End':2,'Speaker':0},
                          {'Start':1,'End':3,'Speaker':1}], 3)
        self.assertEqual(spans, [(0,1000,[0]),(1000,2000,[0,1]),(2000,3000,[1])])

    def test_clamps_end_and_merges_duplicate_same_speaker(self):
        self.assertEqual(timeline([{'Start':-.1,'End':2,'Speaker':0},
                                   {'Start':.5,'End':4,'Speaker':0}], 3), [(0,3000,[0])])

    def test_very_short_input_is_both_first_and_last(self):
        class Processor:
            num_samples_first_audio_chunk = 100
            def __call__(self, audio, **kwargs): return kwargs
        result = list(streaming_inputs(Processor(), [0]*80))
        self.assertEqual(len(result), 1)
        self.assertTrue(result[0]['is_first_audio_chunk'])
        self.assertTrue(result[0]['is_last_audio_chunk'])


if __name__ == '__main__': unittest.main()
