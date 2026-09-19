const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const WINDOW_BLOCK = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;

const SCENE_DELEGATE = `
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)
    appDelegate.window = window
    self.window = window

    for context in connectionOptions.urlContexts {
      _ = RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
    for activity in connectionOptions.userActivities {
      _ = RCTLinkingManager.application(
        UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      _ = RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = RCTLinkingManager.application(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (modConfig) => {
    modConfig.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return modConfig;
  });

  config = withAppDelegate(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (contents.includes("class SceneDelegate")) {
      return modConfig;
    }
    if (!contents.includes("var launchOptions:")) {
      contents = contents.replace(
        "var reactNativeDelegate: ExpoReactNativeFactoryDelegate?",
        "var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?",
      );
    }
    contents = contents.replace(
      "didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil\n  ) -> Bool {\n    let delegate = ReactNativeDelegate()",
      "didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil\n  ) -> Bool {\n    self.launchOptions = launchOptions\n    let delegate = ReactNativeDelegate()",
    );
    contents = contents.replace(WINDOW_BLOCK, "");
    contents = contents.replace(
      "class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {",
      `${SCENE_DELEGATE}\nclass ReactNativeDelegate: ExpoReactNativeFactoryDelegate {`,
    );
    modConfig.modResults.contents = contents;
    return modConfig;
  });

  return config;
}

module.exports = withIosSceneLifecycle;
