# react-native-nitro-markdown consumer ProGuard/R8 rules
# Preserve all Nitro Hybrid Objects and JNI-facing Kotlin classes
-keep class com.margelo.nitro.com.nitromarkdown.** { *; }
-keep class com.nitromarkdown.** { *; }

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
