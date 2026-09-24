import contextlib,json,sys,pathlib
def main():
    request=json.load(sys.stdin)
    with contextlib.redirect_stdout(sys.stderr):
        import numpy as np,soundfile as sf,soxr,sherpa_onnx
        from funasr_onnx import Fsmn_vad
        models=request['models'];audio,rate=sf.read(request['audio'],dtype='float32')
        if audio.ndim>1:audio=audio.mean(axis=1)
        if rate!=16000:audio=soxr.resample(audio,rate,16000);rate=16000
        vad=Fsmn_vad(models['fsmn']['path'],quantize=True)
        segments=vad(audio)
        if len(segments)==1 and isinstance(segments[0],list) and (not segments[0] or isinstance(segments[0][0],list)):segments=segments[0]
        folder=pathlib.Path(models['sensevoice']['path'])
        model=next(folder.glob('*int8.onnx'))
        recognizer=sherpa_onnx.OfflineRecognizer.from_sense_voice(model=str(model),tokens=str(folder/'tokens.txt'),num_threads=4,use_itn=True)
        outputs=[]
        for start,end in segments:
            if end<=start:continue
            stream=recognizer.create_stream();stream.accept_waveform(rate,audio[int(start*16):int(end*16)]);recognizer.decode_stream(stream)
            outputs.append({'start_ms':start,'end_ms':end,'text':stream.result.text})
    print(json.dumps({'text':' '.join(x['text'] for x in outputs),'segments':outputs},ensure_ascii=False))
if __name__=='__main__':
    try:main()
    except Exception as error:print(json.dumps({'error':str(error)}));sys.exit(1)
