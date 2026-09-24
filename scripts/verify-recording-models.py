"""Run with the registered Python environment and an authorized speech WAV."""
import argparse,datetime,json,os,pathlib,subprocess
import numpy as np,soundfile as sf,soxr,sherpa_onnx
p=argparse.ArgumentParser();p.add_argument('--user-dir',required=True);p.add_argument('--audio',required=True);a=p.parse_args()
target=pathlib.Path(a.user_dir)/'recording-models/runtime.json';r=json.loads(target.read_text(encoding='utf-8'))
worker=pathlib.Path(__file__).resolve().parent.parent/'workers/transcribe_recording.py'
from funasr_onnx import Fsmn_vad
reference,reference_rate=sf.read(a.audio,dtype='float32')
if reference.ndim>1:reference=reference.mean(axis=1)
if reference_rate!=16000:reference=soxr.resample(reference,reference_rate,16000)
spans=Fsmn_vad(r['models']['fsmn']['path'],quantize=True)(reference)
if len(spans)==1 and isinstance(spans[0],list) and (not spans[0] or isinstance(spans[0][0],list)):spans=spans[0]
turns=[{'start_ms':a,'end_ms':b,'speaker':'test'} for a,b in spans]
assert turns
out=subprocess.run([r['python'],str(worker)],input=json.dumps({'models':r['models'],'audio':a.audio,'turns':turns}),capture_output=True,text=True,encoding='utf-8',env={**os.environ,'PYTHONIOENCODING':'utf-8'},timeout=180)
assert out.returncode==0,out.stdout
result=json.loads(out.stdout);assert result['text'].strip() and result['segments']
audio,rate=sf.read(a.audio,dtype='float32');audio=audio.mean(axis=1) if audio.ndim>1 else audio
if rate!=16000:audio=soxr.resample(audio,rate,16000)
config=sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=r['models']['campplus']['path'],num_threads=2,provider='cpu')
extractor=sherpa_onnx.SpeakerEmbeddingExtractor(config);stream=extractor.create_stream();stream.accept_waveform(16000,audio);stream.input_finished()
assert extractor.is_ready(stream)
embedding=np.asarray(extractor.compute(stream));assert embedding.size>0 and np.isfinite(embedding).all()
folder=pathlib.Path(r['models']['zipformer']['path'])
spotter=sherpa_onnx.KeywordSpotter(tokens=str(folder/'tokens.txt'),encoder=str(folder/'encoder-epoch-13-avg-2-chunk-16-left-64.int8.onnx'),decoder=str(folder/'decoder-epoch-13-avg-2-chunk-16-left-64.onnx'),joiner=str(folder/'joiner-epoch-13-avg-2-chunk-16-left-64.int8.onnx'),keywords_file=str(folder/'test_wavs/keywords.txt'))
hits=[]
for wav in sorted((folder/'test_wavs').glob('*.wav')):
    samples,sr=sf.read(wav,dtype='float32');stream=spotter.create_stream();stream.accept_waveform(sr,np.concatenate([samples,np.zeros(int(sr*.8),dtype=np.float32)]));stream.input_finished()
    while spotter.is_ready(stream):
        spotter.decode_stream(stream);hit=spotter.get_result(stream)
        if hit:hits.append(str(hit));spotter.reset_stream(stream)
assert hits,'No keyword detected in official fixtures'
for key,m in r['models'].items():
    m.update(verified=True,verified_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),verification={'fsmn':'Authorized speech segmentation','sensevoice':'Nonempty transcript with segments','campplus':f'Finite {embedding.size}-dimension embedding; not diarization','zipformer':f'Official fixtures: {len(hits)} keyword hits; not UI integration'}[key])
temporary=target.with_suffix('.json.tmp');temporary.write_text(json.dumps(r,indent=2),encoding='utf-8');temporary.replace(target)
print(json.dumps({'transcription_segments':len(result['segments']),'embedding_dimensions':embedding.size,'keyword_hits':len(hits),'registered':str(target)}))
