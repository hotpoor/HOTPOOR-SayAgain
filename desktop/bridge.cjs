const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,timingSafeEqual}=require('node:crypto');
async function startBridge(service,userDirectory,onChange=()=>{}) {
 const token=randomBytes(32).toString('hex');
 const descriptor=path.join(userDirectory,'sayagain-connection.json');
 const server=http.createServer(async(req,res)=>{
  const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const provided=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,''));
  if(req.headers.origin || provided.length!==token.length || !timingSafeEqual(provided,Buffer.from(token)))return reply(403,{error:'本地接入未授权'});
  if(!service.integration()?.body.enabled)return reply(403,{error:'Skill 接入已关闭'});
  try{
   if(req.method==='GET'&&req.url==='/v1/context')return reply(200,service.reviewContext());
   if(req.method==='POST'&&req.url==='/v1/reviews'){
    let length=0;const chunks=[];
    for await(const chunk of req){length+=chunk.length;if(length>256*1024){reply(413,{error:'评估记录过大'});req.destroy();return;}chunks.push(chunk);}
    const result=service.submitReview(JSON.parse(Buffer.concat(chunks).toString('utf8')));onChange();return reply(200,result);
   }
   reply(404,{error:'未知接口'});
  }catch(error){reply(400,{error:error.message});}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 fs.mkdirSync(userDirectory,{recursive:true,mode:0o700});
 fs.writeFileSync(descriptor,JSON.stringify({version:1,port:server.address().port,token,pid:process.pid}),{mode:0o600});fs.chmodSync(descriptor,0o600);
 return {server,descriptor,close(){server.closeAllConnections();server.close();try{const current=JSON.parse(fs.readFileSync(descriptor));if(current.token===token)fs.unlinkSync(descriptor);}catch{}}};
}
module.exports={startBridge};
