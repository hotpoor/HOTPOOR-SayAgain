"""Register existing local models. No download, no inference, no database writes."""
import argparse,datetime,json,pathlib,shutil,sys
p=argparse.ArgumentParser()
p.add_argument('--user-dir',required=True);p.add_argument('--sensevoice',required=True);p.add_argument('--campplus',required=True)
p.add_argument('--silero');p.add_argument('--fsmn');p.add_argument('--ffmpeg',default='ffmpeg')
a=p.parse_args()
if not (a.silero or a.fsmn):p.error('provide --silero or --fsmn')
import numpy,soundfile,sherpa_onnx,sklearn
if a.fsmn:import funasr_onnx
ffmpeg=shutil.which(a.ffmpeg)
if not ffmpeg:raise SystemExit('FFmpeg is missing; install it explicitly before registration')
models={}
for key in ['sensevoice','campplus','silero','fsmn']:
    value=getattr(a,key)
    if not value:continue
    target=pathlib.Path(value).expanduser().resolve()
    if not target.exists():raise SystemExit('Missing '+str(target))
    if key=='sensevoice' and not ((target/'tokens.txt').is_file() and list(target.glob('*int8.onnx'))):raise SystemExit('SenseVoice needs tokens.txt and *int8.onnx')
    if key in ['campplus','silero'] and not target.is_file():raise SystemExit(key+' must be an ONNX file')
    models[key]={'path':str(target),'downloaded':True,'verified':False}
folder=pathlib.Path(a.user_dir).expanduser().resolve()/'recording-models';folder.mkdir(parents=True,exist_ok=True)
target=folder/'runtime.json'
if target.exists():
    old=json.loads(target.read_text(encoding='utf-8'))
    # Preserve unrelated registered models such as keyword spotting.
    models={**old.get('models',{}),**models}
    shutil.copy2(target,folder/('runtime.backup-'+datetime.datetime.now().strftime('%Y%m%dT%H%M%S%f')+'.json'))
result={'python':sys.executable,'device':'cpu','ffmpeg':ffmpeg,'models':models}
temp=folder/'runtime.json.tmp';temp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(target)
print('Registered (inference not yet verified): '+str(target))
