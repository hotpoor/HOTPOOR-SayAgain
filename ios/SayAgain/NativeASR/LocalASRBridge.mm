#import "LocalASRBridge.h"
#include "sherpa-onnx/c-api/c-api.h"
#include <mach/mach.h>
#include <exception>
static void SAError(NSError **error,const char *message) {
    if(error) *error = [NSError errorWithDomain:@"SayAgain.LocalASR" code:1 userInfo:@{NSLocalizedDescriptionKey:[NSString stringWithUTF8String:message] ?: @"本机识别失败"}];
}
@implementation SAASREngine {
    const SherpaOnnxOfflineRecognizer *_recognizer;
}
- (nullable instancetype)initWithModelPath:(NSString *)modelPath tokensPath:(NSString *)tokensPath error:(NSError **)error {
    self = [super init];if(!self)return nil;
    try {
        SherpaOnnxOfflineRecognizerConfig config = {};
        config.feat_config.sample_rate = 16000;config.feat_config.feature_dim = 80;
        config.model_config.sense_voice.model = modelPath.UTF8String;
        config.model_config.sense_voice.language = "auto";config.model_config.sense_voice.use_itn = 1;
        config.model_config.tokens = tokensPath.UTF8String;config.model_config.num_threads = 1;
        config.model_config.provider = "cpu";config.model_config.model_type = "sense_voice";
        config.decoding_method = "greedy_search";
        _recognizer = SherpaOnnxCreateOfflineRecognizer(&config);
        if(!_recognizer){SAError(error,"模型初始化失败");return nil;}
    }catch(const std::exception &e){SAError(error,e.what());return nil;}
    return self;
}
- (nullable NSString *)transcribePCM:(NSData *)pcm error:(NSError **)error {
    const SherpaOnnxOfflineStream *stream = nullptr;
    try {
        stream = SherpaOnnxCreateOfflineStream(_recognizer);
        if(!stream){SAError(error,"无法创建识别任务");return nil;}
        SherpaOnnxAcceptWaveformOffline(stream,16000,(const float *)pcm.bytes,(int32_t)(pcm.length/sizeof(float)));
        SherpaOnnxDecodeOfflineStream(_recognizer,stream);
        const auto result = SherpaOnnxGetOfflineStreamResult(stream);
        NSString *text = result && result->text ? [NSString stringWithUTF8String:result->text] : @"";
        if(result)SherpaOnnxDestroyOfflineRecognizerResult(result);
        SherpaOnnxDestroyOfflineStream(stream);return text;
    }catch(const std::exception &e){if(stream)SherpaOnnxDestroyOfflineStream(stream);SAError(error,e.what());return nil;}
}
+ (uint64_t)memoryFootprint {
    task_vm_info_data_t info = {};mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
    if(task_info(mach_task_self(),TASK_VM_INFO,(task_info_t)&info,&count)==KERN_SUCCESS)return info.phys_footprint;
    return 0;
}
- (void)dealloc {if(_recognizer)SherpaOnnxDestroyOfflineRecognizer(_recognizer);}
@end
