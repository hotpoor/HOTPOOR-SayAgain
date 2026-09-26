const fs=require('node:fs'),path=require('node:path'),{Store}=require('../storage/store.cjs');
const databases=['SayAgain','SayAgain1','SayAgain2'];
function copySafe(source,target){
 const stat=fs.lstatSync(source);if(stat.isSymbolicLink())throw Error('备份不能包含符号链接');
 if(stat.isDirectory()){fs.mkdirSync(target,{recursive:true});for(const entry of fs.readdirSync(source))copySafe(path.join(source,entry),path.join(target,entry));}
 else if(stat.isFile())fs.copyFileSync(source,target);else throw Error('备份含不支持的文件类型');
}
function validate(directory){
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
 if(manifest.schema_version!==1||manifest.routing_version!==1)throw Error('不支持此备份版本');
 let store;try{
  for(const file of databases)if(!fs.statSync(path.join(directory,file)).isFile())throw Error('备份数据库不完整');
  store=new Store(directory);
  for(const schema of ['main','shard1','shard2'])if(store.db.prepare(`PRAGMA ${schema}.quick_check`).get().quick_check!=='ok')throw Error('备份数据库校验失败');
  if(store.list('profile').length!==1||store.list('learning_config').length!==1)throw Error('备份缺少用户或学习配置');
  for(const asset of store.list('asset')){const filename=path.resolve(directory,asset.body.relative_path);if(!filename.startsWith(path.resolve(directory,'assets')+path.sep)||!fs.statSync(filename).isFile())throw Error('备份包含无效或缺失的音频');}
  store.rebuild();return{created_at:manifest.created_at,expressions:store.list('expression').length,recordings:store.list('recording').length,voices:store.list('voice').length};
 }finally{store?.close();}
}
function stage(source,current){
 source=fs.realpathSync(source);if(source===current||source.startsWith(current+path.sep))throw Error('请选择导出的完整备份目录');
 const target=fs.mkdtempSync(path.join(path.dirname(current),'.restore-check-'));
 try{for(const name of [...databases,'manifest.json','assets'])copySafe(path.join(source,name),path.join(target,name));return{directory:target,summary:validate(target)};}catch(e){fs.rmSync(target,{recursive:true,force:true});throw e;}
}
function restore(service,staged){
 validate(staged);
 const current=service.directory,safety=current+'-before-restore-'+Date.now();
 service.backup(safety);service.store.close();
 const retired=current+'-restore-old-'+Date.now();
 try{fs.renameSync(current,retired);fs.renameSync(staged,current);service.store=new Store(current);service.profileId=service.store.list('profile')[0].block_id;}
 catch(error){service.store?.db?.isOpen&&service.store.close();if(fs.existsSync(retired)){fs.rmSync(current,{recursive:true,force:true});fs.renameSync(retired,current);}service.store=new Store(current);service.profileId=service.store.list('profile')[0].block_id;throw error;}
 fs.rmSync(retired,{recursive:true,force:true});return{safety_backup:safety};
}
module.exports={stage,restore,validate};
