// Register an already installed IndexTTS 2.5 environment; never downloads or installs.
const path = require('node:path');
const {connectionFile} = require('../skills/sayagain/scripts/client.cjs');
const {register, status} = require('../desktop/index-tts-runtime.cjs');
async function main(args) {
 if (args.includes('--help')) return {usage:'node scripts/register-index-tts.cjs --python /absolute/venv/bin/python --repo-path /absolute/index-tts --model-path /absolute/checkpoints --device cpu|mps|cuda:0 [--data-dir /absolute/SayAgain-data]'};
 const options = {};
 for(let i=0;i<args.length;i+=2){
  if(!['--python','--repo-path','--model-path','--device','--data-dir'].includes(args[i]) || !args[i+1] || args[i+1].startsWith('--')) throw Error('参数无效；使用 --help 查看登记方式');
  options[args[i].slice(2).replaceAll('-','_')] = args[i+1];
 }
 const directory = options.data_dir || process.env.SAYAGAIN_DATA_DIR || path.dirname(connectionFile());
 if (!args.length) {const result=status(directory);return {...result,runtime:undefined};}
 return register(directory, options);
}
if(require.main===module)main(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
