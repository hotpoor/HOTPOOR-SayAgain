const fs=require('node:fs/promises'),path=require('node:path');
const source=path.join(__dirname,'../skills/sayagain');
async function exportSkill(parent){
 const container=await fs.mkdtemp(path.join(parent,'SayAgain-Skill-'));
 const destination=path.join(container,'sayagain');
 try{await fs.cp(source,destination,{recursive:true,errorOnExist:true,force:false,filter:src=>!['.DS_Store','__pycache__'].includes(path.basename(src))});return destination;}catch(error){await fs.rm(container,{recursive:true,force:true});throw error;}
}
module.exports={source,exportSkill};
async function copyableSkill(){
 const files=[];
 async function walk(directory,prefix=''){for(const entry of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(['.DS_Store','__pycache__'].includes(entry.name))continue;const relative=prefix+entry.name;if(entry.isDirectory())await walk(path.join(directory,entry.name),relative+'/');else if(entry.isFile())files.push({relative,body:await fs.readFile(path.join(directory,entry.name),'utf8')});}}
 await walk(source);
 const introduction='# SayAgain 完整 Skill 包\n\n请将下列文件按相对路径保存到一个 sayagain 文件夹，再读取 SKILL.md。若需要安装，请使用你的客户端支持的 Skill 目录；不要覆盖已有同名 Skill，应先比较内容。所有所需脚本与协议都在下方，无需访问原仓库。SayAgain 必须在执行命令的同一台电脑运行，并启用本地接口。需要 Node.js 22 或更新版本。先执行 scripts/client.cjs context 验证连接。接着按 references/persistence.md 确认使用范围：仅本次对话、指定工作区或所有工作区；已有明确选择则直接执行。选择持久范围后，将约定合并到客户端实际加载的工作区或全局说明，回读核对并报告路径；仅复制技能不算已持久启用。尚未授权安装模型或启用全局 hook。\n\n';
 return introduction+files.map(({relative,body})=>{const fence='`'.repeat(Math.max(3,...Array.from(body.matchAll(/`+/g),m=>m[0].length+1)));return `## sayagain/${relative}\n\n${fence}\n${body.trimEnd()}\n${fence}\n`;}).join('\n');
}
module.exports.copyableSkill=copyableSkill;
