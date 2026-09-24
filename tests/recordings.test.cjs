const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Service}=require('../desktop/service.cjs');
function wav(){const b=Buffer.alloc(44+32000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);return b;}
test('recording groups persist multiple clips, retry dedupes, notes do not replace audio',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-recordings-'));let s=new Service(root);t.after(()=>{s.close();fs.rmSync(root,{recursive:true,force:true});});
 const recording=s.createRecording({title:'会话'}),base={recording_id:recording.block_id,bytes:wav(),source:'import',source_name:'clip.wav'};
 const one=s.addRecordingClip({...base,client_id:'one'});assert.equal(s.addRecordingClip({...base,client_id:'one'}).block_id,one.block_id);
 const two=s.addRecordingClip({...base,client_id:'two',source_offset_ms:1000});assert.equal(two.body.sequence,1);assert.equal(two.body.captured_at,null);
 const updated=s.updateRecordingTranscript({id:one.block_id,revision:one.body.revision,text:'corrected text'});assert.equal(updated.body.asset_id,one.body.asset_id);
 assert.throws(()=>s.updateRecordingTranscript({id:one.block_id,revision:one.body.revision,text:'stale'}),/更新/);
 assert.throws(()=>s.addRecordingClip({...base,client_id:'bad',bytes:Buffer.from('bad')}));
 assert.equal(s.state().recordings[0].body.clip_count,2);
 s.close();s=new Service(root);assert.equal(s.state().recording_clips.length,2);assert.equal(s.state().recordings[0].body.duration_ms,2000);
});
