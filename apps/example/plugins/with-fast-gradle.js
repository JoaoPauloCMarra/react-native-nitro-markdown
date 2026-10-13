const { withGradleProperties } = require("expo/config-plugins");

const FAST_GRADLE_PROPERTIES = {
  "org.gradle.caching": "true",
  "org.gradle.parallel": "true",
  "org.gradle.jvmargs":
    "-Xmx6g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8",
  "kotlin.daemon.jvmargs": "-Xmx3g",
};

module.exports = function withFastGradle(config) {
  return withGradleProperties(config, (configWithProperties) => {
    const properties = configWithProperties.modResults;
    for (const [key, value] of Object.entries(FAST_GRADLE_PROPERTIES)) {
      const existing = properties.find(
        (item) => item.type === "property" && item.key === key,
      );
      if (existing) {
        existing.value = value;
      } else {
        properties.push({ type: "property", key, value });
      }
    }
    return configWithProperties;
  });
};
