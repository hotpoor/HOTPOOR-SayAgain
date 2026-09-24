"""Run by the Skill, never automatically by the desktop UI."""
import argparse,hashlib,json,pathlib,shutil,subprocess,sys,tarfile,urllib.request,requests
p=argparse.ArgumentParser();p.add_argument('--models-dir',required=True);p.add_argument('--user-dir',required=True);a=p.parse_args()
root=pathlib.Path(a.models_dir).resolve();root.mkdir(parents=True,exist_ok=True)
if shutil.disk_usage(root).free<2*1024**3:raise SystemExit('Need 2 GiB free for downloads, extraction and cache')
def api(url):
    response=requests.get(url,timeout=60);response.raise_for_status();return response.json()
def download(url,target,size=None,digest=None):
    if target.exists() and (not size or target.stat().st_size==size) and (not digest or hashlib.sha256(target.read_bytes()).hexdigest()==digest):return
    partial=target.with_suffix(target.suffix+'.part')
    with requests.get(url,stream=True,timeout=(20,120)) as response:
        response.raise_for_status()
        with partial.open('wb') as output:
            for chunk in response.iter_content(1024*1024):output.write(chunk)
    if size and partial.stat().st_size!=size:raise ValueError('Download size mismatch')
    if digest and hashlib.sha256(partial.read_bytes()).hexdigest()!=digest:raise ValueError('Download hash mismatch')
    partial.replace(target)
models={}
items=[('sensevoice','asr-models','sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2'),('campplus','speaker-recongition-models','3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx'),('zipformer','kws-models','sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20.tar.bz2')]
for key,tag,name in items:
    meta=api('https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/'+tag)
    asset=next(x for x in meta['assets'] if x['name']==name);target=root/name
    digest=(asset.get('digest') or '').removeprefix('sha256:') or None
    download(asset['browser_download_url'],target,asset['size'],digest)
    if name.endswith('.tar.bz2'):
        folder=root/name.removesuffix('.tar.bz2')
        with tarfile.open(target) as archive:
            for member in archive.getmembers():
                dest=(root/member.name).resolve()
                if not dest.is_relative_to(root) or member.issym() or member.islnk() or not (member.isfile() or member.isdir()):raise ValueError('Unsafe archive member')
            archive.extractall(root)
    else:folder=target
    models[key]={'path':str(folder),'downloaded':True,'verified':False,'source':asset['browser_download_url']}
    print(key+' downloaded',flush=True)
repo='funasr/fsmn-vad-onnx';revision='f6e9fbb4cefa7397216c763f21307993f147f585'
meta=api(f'https://huggingface.co/api/models/{repo}/revision/{revision}?blobs=true')
folder=root/'fsmn-vad';folder.mkdir(exist_ok=True)
for name in ['model.onnx','model_quant.onnx','vad.mvn','vad.yaml']:
    entry=next(x for x in meta['siblings'] if x['rfilename']==name)
    download(f'https://huggingface.co/{repo}/resolve/{revision}/{name}',folder/name,entry.get('size'),entry.get('lfs',{}).get('sha256'))
# Adapt the official legacy export filenames/config to funasr-onnx 0.4.3.
import yaml
config=yaml.safe_load((folder/'vad.yaml').read_text(encoding='utf-8'))
config['model_conf']=config.pop('vad_post_conf')
(folder/'config.yaml').write_text(yaml.safe_dump(config),encoding='utf-8')
shutil.copyfile(folder/'vad.mvn',folder/'am.mvn')
models['fsmn']={'path':str(folder),'downloaded':True,'verified':False,'source':repo+'@'+revision}
directory=pathlib.Path(a.user_dir)/'recording-models';directory.mkdir(parents=True,exist_ok=True)
target=directory/'runtime.json'
manifest={'python':sys.executable,'device':'cpu','models':models}
target.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('Registered downloaded models: '+str(target))
