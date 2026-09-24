"""Run with the isolated recording Python environment."""
import sys,pathlib,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'workers'))
from speaker_pipeline import cluster,split_turn,options
import numpy as np

class PipelineTest(unittest.TestCase):
    def test_outlier_does_not_become_second_main_speaker(self):
        rng=np.random.default_rng(42)
        e=np.vstack([np.array([1.,0.,0.])+rng.normal(0,.025,(60,3)),np.array([0.,1.,0.])+rng.normal(0,.025,(60,3)),[0.,0.,1.]])
        e/=np.linalg.norm(e,axis=1)[:,None]
        w=np.array([[i*3,i*3+(3 if i<120 else .7),i] for i in range(121)])
        labels,similarities,stats=cluster(e,w)
        self.assertEqual(stats['speakers'],2)
        self.assertEqual(len(set(labels[:60])),1);self.assertEqual(len(set(labels[60:120])),1)
        self.assertNotEqual(labels[0],labels[60]);self.assertLess(similarities[-1],.2)
    def test_only_tiny_speech_is_unknown(self):
        labels,_,stats=cluster(np.array([[1.,0.]]),np.array([[0,.8,0]]))
        self.assertEqual(labels.tolist(),[-1]);self.assertEqual(stats['speakers'],0)
    def test_low_energy_split_preserves_coverage(self):
        audio=np.ones(45*16000,dtype=np.float32);audio[12*16000:13*16000]=0
        spans=split_turn(audio,0,45)
        self.assertEqual(spans[0][0],0);self.assertEqual(spans[-1][1],45)
        self.assertTrue(12<=spans[0][1]<=13)
        self.assertTrue(all(b-a<=18 for a,b in spans))
        self.assertTrue(all(spans[i][1]==spans[i+1][0] for i in range(len(spans)-1)))
    def test_options(self):
        with self.assertRaises(ValueError):options({'speaker_count':True})
        with self.assertRaises(ValueError):options({'language':'xx'})

if __name__=='__main__':unittest.main()
