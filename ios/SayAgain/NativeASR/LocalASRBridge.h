#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface SAASREngine : NSObject
- (nullable instancetype)initWithModelPath:(NSString *)modelPath tokensPath:(NSString *)tokensPath error:(NSError **)error;
- (nullable NSString *)transcribePCM:(NSData *)pcm error:(NSError **)error;
+ (uint64_t)memoryFootprint;
@end
NS_ASSUME_NONNULL_END
