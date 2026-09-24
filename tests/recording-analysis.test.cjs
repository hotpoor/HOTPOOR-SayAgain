const {test}=require('node:test'),assert=require('node:assert/strict'),{analyze}=require('../desktop/recording-models.cjs');
const service={entity:()=>({body:{revision:1}})};
test('recording analysis rejects invalid modes and keyword input before launching models',async()=>{
 await assert.rejects(analyze(service,'nonexistent',{id:'x',mode:'other'}),/模式/);
 for(const keywords of ['', '@injection', 'a'.repeat(61),Array(21).fill('word').join(',')])await assert.rejects(analyze(service,'nonexistent',{id:'x',mode:'keywords',keywords}),/关键词/);
 await assert.rejects(analyze(service,'nonexistent',{id:'x',mode:'keywords',keywords:'hello,学习'}),/登记/);
});
