const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateTurns,confirmed}=require('../desktop/confirmed-turns.cjs');
test('confirmed turns reject overlap, inverted bounds, overflow and missing speakers',()=>{
 for(const list of [[{start_ms:0,end_ms:1001,speaker:'A'}],[{start_ms:2,end_ms:1,speaker:'A'}],[{start_ms:0,end_ms:500,speaker:''}],[{start_ms:0,end_ms:500,speaker:'A'},{start_ms:499,end_ms:900,speaker:'B'}],[]])assert.throws(()=>validateTurns(list,1000));
 assert.deepEqual(validateTurns([{start_ms:0,end_ms:500,speaker:' A '},{start_ms:500,end_ms:1000,speaker:'B'}],1000).map(t=>t.speaker),['A','B']);
 assert.throws(()=>confirmed({body:{duration_ms:1000,speaker_analysis:{status:'machine_unreviewed',segments:[]}}}),/确认/);
});
