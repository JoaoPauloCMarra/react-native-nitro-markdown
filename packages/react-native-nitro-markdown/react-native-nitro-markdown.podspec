require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-nitro-markdown"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "16.4" }
  s.source       = { :git => "https://github.com/JoaoPauloCMarra/react-native-nitro-markdown.git", :tag => "v#{s.version}" }
  s.module_name  = "NitroMarkdown"

  s.source_files = [
    "ios/**/*.{h,m,mm,swift}",
    "cpp/**/*.{h,hpp,c,cpp}"
  ]
  s.exclude_files = [
    "cpp/core/*Test.cpp"
  ]
  s.private_header_files = "cpp/**/*.{h,hpp}"

  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "CLANG_CXX_LIBRARY" => "libc++",
    "GCC_PREPROCESSOR_DEFINITIONS" => "$(inherited) MD4C_USE_UTF8=1 _FORTIFY_SOURCE=2",
    "OTHER_CFLAGS" => "$(inherited) -Wall -Wextra -fstack-protector-strong -Werror=format-security",
    "OTHER_CPLUSPLUS_FLAGS" => "$(inherited) -Wall -Wextra -fstack-protector-strong -Werror=format-security",
    "OTHER_SWIFT_FLAGS" => "$(inherited) -Xcc -fmodule-map-file=$(PODS_TARGET_SRCROOT)/ios/NitroMarkdownObjC.modulemap",
    "HEADER_SEARCH_PATHS" => [
      "$(PODS_ROOT)/Headers/Private/Yoga",
      "$(PODS_TARGET_SRCROOT)/cpp/nitromd",
      "$(PODS_TARGET_SRCROOT)/cpp/core",
      "$(PODS_TARGET_SRCROOT)/cpp/bindings",
      "$(PODS_TARGET_SRCROOT)/nitrogen/generated/shared/c++",
      "$(PODS_TARGET_SRCROOT)/nitrogen/generated/ios"
    ]
  }

  s.dependency "React-Core"
  s.dependency "React-Fabric"

  load 'nitrogen/generated/ios/NitroMarkdown+autolinking.rb'
  add_nitrogen_files(s)
end
