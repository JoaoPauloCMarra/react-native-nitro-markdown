#import "NitroMarkdownTryCatch.h"

@implementation NitroMarkdownTryCatch

+ (void)performBlock:(void (^)(void))block
             onError:(void (^)(NSException *exception))errorHandler {
  @try {
    block();
  } @catch (NSException *exception) {
    if (errorHandler != nil) {
      errorHandler(exception);
    }
  }
}

@end
