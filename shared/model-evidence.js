(function(root){
 const commonHash='c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51';
 const sources={
  sherpa:{label:'sherpa 官方模型说明',url:'https://k2-fsa.github.io/sherpa/onnx/sense-voice/pretrained.html'},
  generalDownload:{label:'官方通用版下载',url:'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2'},
  yueDownload:{label:'官方粤语版下载',url:'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2'},
  quantGuide:{label:'闪电说官网量化说明',url:'https://shandianshuo.cn/docs/faq/memory-quantized-model'},
  quantModel:{label:'iic 官方 ONNX 模型库',url:'https://modelscope.cn/models/iic/SenseVoiceSmall-onnx/files'},
 };
 const records=[
  {id:'general',title:'官方通用版',label:'sherpa-onnx · 2024-07-17 · INT8',model:'SenseVoiceSmall 通用模型',file:'model.int8.onnx',bytes:239233841,sha256:commonHash,detail:'官方发布的通用 INT8 导出文件。开启 ITN 时支持标点；支持中、英、日、韩、粤语。日期是导出包标识。',evidence:'官方发布包通过大小及 SHA-256 校验，再对包内模型计算完整指纹。',sources:['sherpa','generalDownload']},
  {id:'cantonese',title:'官方粤语微调版',label:'sherpa-onnx · 2025-09-09 · INT8',model:'ASLP-lab / WSYue-ASR · SenseVoiceSmall 粤语微调',file:'model.int8.onnx',bytes:237115547,sha256:'12ca1a2ae7ecf3e0019ef2822307ee0b5cadc9196569e379b4c4026f8205276d',detail:'官方说明：在通用模型上使用粤语数据微调，仍支持五种语言；该版不支持标点。',evidence:'官方发布包通过大小及 SHA-256 校验，模型元数据标明 ASLP-lab / WSYue-ASR。',sources:['sherpa','yueDownload']},
  {id:'freenote',title:'Freenote / PatchxNote 内置样本',label:'PatchxNote 1.0.2（21）· patchnote-standard 0.2.0',model:'同一份官方 SenseVoiceSmall 通用 INT8 模型',file:'model.int8.onnx',bytes:239233841,sha256:commonHash,detail:'Freenote / PatchxNote 也选用了相同的官方通用模型。应用名称、模型包标识与公开模型名称属于不同层级。',evidence:'本次核对的内置文件与官方 2024-07-17 通用 INT8 文件完整 SHA-256 相同。仅说明文件一致，不推断产品之间的技术来源关系。',sources:['sherpa','generalDownload']},
  {id:'shandianshuo',title:'闪电说官网推荐的量化版',label:'应用显示 SenseVoice Small · 本地；文件名 model.onnx',model:'iic / SenseVoiceSmall-onnx · 官方量化导出',file:'model_quant.onnx → model.onnx（按官网说明更名）',bytes:241216270,sha256:'21dc965f689a78d1604717bf561e40d5a236087c85a95584567835750549e822',detail:'ONNX 是模型导出格式。此样本从官网指向的 iic 官方模型库手动安装；文件更名不改变内容。',evidence:'大小及 SHA-256 与官方模型库一致。文件提交日期 2024-09-25，修订 4e95991ddb34c70e9b94f026d62ac82a9d941ae1；不是训练日期。尚未核对闪电说自动下载的默认文件。',sources:['quantGuide','quantModel']},
 ];
 const catalog={verifiedOn:'2026-09-25',sources,records};
 if(typeof module==='object'&&module.exports)module.exports=catalog;
 else root.sayagainModelEvidence=catalog;
})(typeof window==='object'?window:globalThis);
