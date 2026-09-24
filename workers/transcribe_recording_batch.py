import contextlib,json,sys,pathlib

def main():
    request=json.load(sys.stdin);output=sys.stdout
    def emit(value):print(json.dumps(value,ensure_ascii=False),file=output,flush=True)
    with contextlib.redirect_stdout(sys.stderr):
        import soundfile as sf,soxr,sherpa_onnx
        from funasr_onnx import Fsmn_vad
        models=request['models'];folder=pathlib.Path(models['sensevoice']['path'])
        recognizer=sherpa_onnx.OfflineRecognizer.from_sense_voice(model=str(next(folder.glob('*int8.onnx'))),tokens=str(folder/'tokens.txt'),num_threads=4,use_itn=True)
        for clip in request['clips']:
            audio,rate=sf.read(clip['audio'],dtype='float32')
            if audio.ndim>1:audio=audio.mean(axis=1)
            if rate!=16000:audio=soxr.resample(audio,rate,16000)
            turns=clip.get('turns')
            if not turns:raise ValueError('请先确认说话人和时间段')
            segments=[]
            for turn in turns:
                start,end=turn['start_ms'],turn['end_ms']
                if end<=start:continue
                stream=recognizer.create_stream();stream.accept_waveform(16000,audio[int(start*16):int(end*16)]);recognizer.decode_stream(stream)
                segments.append({'start_ms':start,'end_ms':end,'speaker':turn['speaker'],'text':stream.result.text})
            emit({'type':'clip','clip':{'id':clip['id'],'text':' '.join(s['text'] for s in segments),'segments':segments}})
    emit({'type':'done'})
if __name__=='__main__':
    try:main()
    except Exception as error:print(json.dumps({'error':str(error)},ensure_ascii=False),flush=True);sys.exit(1)
