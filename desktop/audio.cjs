function parseWav(bytes) {
 if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
 if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw new Error('生成结果不是有效 WAV 音频');
 let format,channels,rate,bits,data;
 for(let p=12;p+8<=bytes.length;){const size=bytes.readUInt32LE(p+4),end=p+8+size;if(end>bytes.length)throw new Error('WAV 音频不完整');const name=bytes.toString('ascii',p,p+4);if(name==='fmt '&&size>=16){format=bytes.readUInt16LE(p+8);channels=bytes.readUInt16LE(p+10);rate=bytes.readUInt32LE(p+12);bits=bytes.readUInt16LE(p+22);}if(name==='data')data=bytes.subarray(p+8,end);p=end+(size%2);}
 if(format!==1||bits!==16||!channels||channels>2||rate<8000||rate>96000||!data?.length||data.length%(2*channels))throw new Error('需要 16 位 PCM WAV 音频');
 const frames=data.length/(2*channels),duration_ms=Math.round(frames/rate*1000);
 if(duration_ms<=0||duration_ms>600000)throw new Error('音频时长不正确');
 const waveform=Array.from({length:64},(_,i)=>{let peak=0;const start=Math.floor(frames*i/64),end=Math.floor(frames*(i+1)/64);for(let n=start;n<end;n+=Math.max(1,Math.floor((end-start)/1500)))for(let c=0;c<channels;c++)peak=Math.max(peak,Math.abs(data.readInt16LE((n*channels+c)*2))/32768);return peak;});
 const max=Math.max(...waveform,.01);return{duration_ms,waveform:waveform.map(v=>v/max),sample_rate:rate,channels};
}
module.exports={parseWav};
