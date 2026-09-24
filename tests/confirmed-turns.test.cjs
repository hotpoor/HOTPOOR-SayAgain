const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateTurns,confirmed}=require('../desktop/confirmed-turns.cjs');
test('confirmed turns reject overlap, inverted bounds, overflow and missing speakers',()=>{
 for(const list of [[{start_ms:0,end_ms:1001,speaker:'A'}],[{start_ms:2,end_ms:1,speaker:'A'}],[{start_ms:0,end_ms:500,speaker:''}],[{start_ms:0,end_ms:500,speaker:'A'},{start_ms:499,end_ms:900,speaker:'B'}],[]])assert.throws(()=>validateTurns(list,1000));
 assert.deepEqual(validateTurns([{start_ms:0,end_ms:500,speaker:' A '},{start_ms:500,end_ms:1000,speaker:'B'}],1000).map(t=>t.speaker),['A','B']);
 assert.throws(()=>confirmed({body:{duration_ms:1000,speaker_analysis:{status:'machine_unreviewed',segments:[]}}}),/确认/);
});
test('multiple selected speakers retain separate identities and reject empty or ambiguous choices',()=>{
 const row={start_ms:0,end_ms:1000,speakers:['A','B']};assert.deepEqual(validateTurns([row],1000)[0].speakers,['A','B']);
 for(const speakers of [[],['A','A'],['不确定','A'],[''],[42]])assert.throws(()=>validateTurns([{...row,speakers}],1000));
});

test('automatic ASR accepts machine candidates and legacy clips without changing review status',()=>{
 const {transcribable}=require('../desktop/confirmed-turns.cjs');
 const clip={body:{duration_ms:1000,speaker_analysis:{status:'machine_unreviewed',segments:[{start_ms:10,end_ms:900,speaker:'A'}]}}};
 assert.deepEqual(transcribable(clip),clip.body.speaker_analysis.segments);assert.equal(clip.body.speaker_analysis.status,'machine_unreviewed');
 assert.equal(transcribable({body:{duration_ms:1000}})[0].speaker,'不确定');
 clip.body.speaker_analysis.segments[0].end_ms=1001;assert.throws(()=>transcribable(clip));
});
