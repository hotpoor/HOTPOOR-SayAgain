function inspectWav(input,{allowStreamingHeader=false}={}) {
 const bytes=Buffer.isBuffer(input)?input:Buffer.from(input);
 if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw new Error('生成结果不是有效 WAV 音频');
 let format,channels,rate,bits,align,data;
 for(let p=12;p+8<=bytes.length;){
  const name=bytes.toString('ascii',p,p+4),size=bytes.readUInt32LE(p+4);let end=p+8+size;
  // Some complete TTS downloads retain an unknown-length streaming data header.
  // Only accept a large sentinel in the final data chunk, never arbitrary truncation.
  if(end>bytes.length){
   if(allowStreamingHeader&&name==='data'&&size>=0x7fff0000&&format===1)end=bytes.length;
   else throw new Error('WAV 音频不完整');
  }
  if(name==='fmt '&&size>=16){format=bytes.readUInt16LE(p+8);channels=bytes.readUInt16LE(p+10);rate=bytes.readUInt32LE(p+12);align=bytes.readUInt16LE(p+20);bits=bytes.readUInt16LE(p+22);}
  if(name==='data'){if(data)throw new Error('不支持多个 WAV data 块');data=bytes.subarray(p+8,end);}
  p=end+((end-p-8)%2);
 }
 if(format!==1||bits!==16||!channels||channels>2||align!==channels*2||rate<8000||rate>96000||!data?.length||data.length%(2*channels))throw new Error('需要完整的 16 位 PCM WAV 音频');
 const frames=data.length/(2*channels),duration_ms=Math.round(frames/rate*1000);
 if(duration_ms<=0||duration_ms>600000)throw new Error('音频时长不正确');
 const waveform=Array.from({length:64},(_,i)=>{let peak=0;const start=Math.floor(frames*i/64),end=Math.floor(frames*(i+1)/64);for(let n=start;n<end;n+=Math.max(1,Math.floor((end-start)/1500)))for(let c=0;c<channels;c++)peak=Math.max(peak,Math.abs(data.readInt16LE((n*channels+c)*2))/32768);return peak;});
 const max=Math.max(...waveform,.01);return{data,metadata:{duration_ms,waveform:waveform.map(v=>v/max),sample_rate:rate,channels}};
}
function parseWav(bytes){return inspectWav(bytes).metadata;}
function normalizeCloudWav(bytes){
 const {data,metadata:{sample_rate,channels}}=inspectWav(bytes,{allowStreamingHeader:true});
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+data.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(channels,22);header.writeUInt32LE(sample_rate,24);header.writeUInt32LE(sample_rate*channels*2,28);header.writeUInt16LE(channels*2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(data.length,40);
 return Buffer.concat([header,data]);
}
module.exports={parseWav,normalizeCloudWav};
