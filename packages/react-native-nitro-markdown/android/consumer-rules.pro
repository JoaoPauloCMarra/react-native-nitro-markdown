# react-native-nitro-markdown consumer ProGuard/R8 rules
# Preserve all Nitro Hybrid Objects and JNI-facing Kotlin classes
-keep class com.margelo.nitro.com.nitromarkdown.** { *; }
-keep class com.nitromarkdown.** { *; }

# C5: Explicitly preserve nitrogen-generated Func_* wrapper classes accessed via JNI reflection.
# These are already covered by the wildcard above, but explicit rules guard against future
# refactors that might narrow the wildcard, and make the intent clear to ProGuard/R8.
-keep class com.margelo.nitro.com.nitromarkdown.Func_void { *; }
-keep class com.margelo.nitro.com.nitromarkdown.Func_void_cxx { *; }
-keep class com.margelo.nitro.com.nitromarkdown.Func_void_java { *; }
-keep class com.margelo.nitro.com.nitromarkdown.Func_void_double_double { *; }
-keep class com.margelo.nitro.com.nitromarkdown.Func_void_double_double_cxx { *; }
-keep class com.margelo.nitro.com.nitromarkdown.Func_void_double_double_java { *; }
-keepclassmembers class com.margelo.nitro.com.nitromarkdown.Func_** {
    <init>(...);
    void invoke(...);
    *;
}

# Preserve JNI-registered native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Preserve Facebook JNI annotations
-keep @com.facebook.proguard.annotations.DoNotStrip class * { *; }
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}
-keep @com.facebook.react.bridge.ReactModule class * { *; }
