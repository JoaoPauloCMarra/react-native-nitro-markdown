const httpFixture = process.env.EXPO_PUBLIC_MARKDOWN_HTTP_FIXTURE === "1";
const androidArchs = (process.env.NITRO_ANDROID_ARCHS ?? "")
  .split(",")
  .map((arch) => arch.trim())
  .filter(Boolean);

module.exports = {
  "expo": {
    "name": "Nitro Markdown",
    "slug": "nitro-markdown-example",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "nitromarkdown",
    "userInterfaceStyle": "automatic",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.nitromarkdown.example"
    },
    "android": {
      "package": "com.nitromarkdown.example",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#101038"
      }
    },
    "plugins": [
      "expo-router",
      [
        "expo-build-properties",
        {
          "android": {
            "compileSdkVersion": 37,
            "targetSdkVersion": 36,
            "buildToolsVersion": "37.0.0",
            "usePrecompiledHeaders": true,
            ...(androidArchs.length > 0 ? { "buildArchs": androidArchs } : {}),
            ...(httpFixture ? { "usesCleartextTraffic": true } : {})
          },
          "ios": {
            "deploymentTarget": "16.4",
            "ccacheEnabled": true
          }
        }
      ],
      "expo-system-ui",
      "expo-status-bar",
      "./plugins/with-fast-gradle",
      "./plugins/with-ios-linker-cleanup"
    ],
    "experiments": {
      "reactCompiler": true,
      "typedRoutes": true,
      "autolinkingModuleResolution": true
    }
  }
};
