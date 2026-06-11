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
            "compileSdkVersion": 36,
            "targetSdkVersion": 36,
            "buildToolsVersion": "36.0.0",
            "usePrecompiledHeaders": true
          },
          "ios": {
            "deploymentTarget": "16.4"
          }
        }
      ],
      "expo-system-ui",
      "expo-status-bar",
      "./plugins/with-ios-linker-cleanup"
    ],
    "experiments": {
      "reactCompiler": true,
      "typedRoutes": true,
      "autolinkingModuleResolution": true
    }
  }
};
