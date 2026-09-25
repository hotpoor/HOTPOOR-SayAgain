// Colors are data, never arbitrary SVG/CSS markup.
module.exports=value=>{if(value==null||value==='')return null;if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw Error('请选择有效的六位十六进制颜色');return value.toLowerCase();};
