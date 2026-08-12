#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Objective-C exception barrier used to contain per-listener exceptions so a
/// throwing listener cannot escape into the mutation call or break peer
/// listeners. Swift cannot catch NSExceptions directly.
@interface NitroMarkdownTryCatch : NSObject

+ (void)performBlock:(void (^)(void))block
             onError:(void (^)(NSException *exception))errorHandler;

@end

NS_ASSUME_NONNULL_END
