#include <jni.h>
#include "NitroMarkdownOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return margelo::nitro::Markdown::initialize(vm);
}

