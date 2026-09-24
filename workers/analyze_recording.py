import contextlib,json,sys,pathlib,tempfile

def main():
    request=json.load(sys.stdin)
    with contextlib.redirect_stdout(sys.stderr):
        import numpy as np,soundfile as sf,soxr,sherpa_onnx
        from funasr_onnx import Fsmn_vad
        models=request['models']; mode=request['mode']; outputs=[];centers=[]
        if mode=='speakers':
            vad=Fsmn_vad(models['fsmn']['path'],quantize=True)
            extractor=sherpa_onnx.SpeakerEmbeddingExtractor(sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=models['campplus']['path'],num_threads=2,provider='cpu'))
        else:
            folder=pathlib.Path(models['zipformer']['path']); lines=[]
            for i,word in enumerate(request['keywords']):
                encoded=sherpa_onnx.text2token([word.upper()],str(folder/'tokens.txt'),tokens_type='phone+ppinyin',lexicon=str(folder/'en.phone'))
                if len(encoded)!=1 or not encoded[0]:raise ValueError('无法编码关键词：'+word)
                lines.append(' '.join(encoded[0])+' @K'+str(i))
            temp=tempfile.TemporaryDirectory()
            keywords=pathlib.Path(temp.name)/'keywords.txt';keywords.write_text('\n'.join(lines),encoding='utf-8')
            spotter=sherpa_onnx.KeywordSpotter(tokens=str(folder/'tokens.txt'),encoder=str(folder/'encoder-epoch-13-avg-2-chunk-16-left-64.int8.onnx'),decoder=str(folder/'decoder-epoch-13-avg-2-chunk-16-left-64.onnx'),joiner=str(folder/'joiner-epoch-13-avg-2-chunk-16-left-64.int8.onnx'),keywords_file=str(keywords))
        for clip in request['clips']:
            audio,rate=sf.read(clip['audio'],dtype='float32')
            if audio.ndim>1:audio=audio.mean(axis=1)
            if rate!=16000:audio=soxr.resample(audio,rate,16000)
            segments=[]
            if mode=='speakers':
                spans=vad(audio)
                if len(spans)==1 and isinstance(spans[0],list) and (not spans[0] or isinstance(spans[0][0],list)):spans=spans[0]
                for start,end in spans:
                    for at in range(int(start),int(end),3000):
                        stop=min(at+3000,int(end));label=None
                        if stop-at>=1000:
                            stream=extractor.create_stream();stream.accept_waveform(16000,audio[at*16:stop*16]);stream.input_finished()
                            if extractor.is_ready(stream):
                                vector=np.asarray(extractor.compute(stream));norm=np.linalg.norm(vector)
                                if not np.isfinite(vector).all() or norm==0:raise ValueError('无效声音特征')
                                vector=vector/norm;scores=[float(np.dot(vector,c)) for c in centers]
                                best=int(np.argmax(scores)) if scores else -1
                                if best<0 or scores[best]<0.65:best=len(centers);centers.append(vector)
                                label='S'+str(best+1)
                        segments.append({'start_ms':at,'end_ms':stop,'speaker':label})
            else:
                stream=spotter.create_stream();stream.accept_waveform(16000,np.concatenate([audio,np.zeros(12800,dtype=np.float32)]));stream.input_finished()
                while spotter.is_ready(stream):
                    spotter.decode_stream(stream);hit=spotter.get_result(stream)
                    if hit:
                        index=int(hit[1:]);segments.append({'keyword':request['keywords'][index]});spotter.reset_stream(stream)
            outputs.append({'id':clip['id'],'segments':segments})
    print(json.dumps({'clips':outputs},ensure_ascii=False))
if __name__=='__main__':
    try:main()
    except Exception as error:print(json.dumps({'error':str(error)}));sys.exit(1)
