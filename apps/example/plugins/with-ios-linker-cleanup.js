const { withXcodeProject } = require("expo/config-plugins");

function normalizeOtherLdFlags(value) {
  if (Array.isArray(value)) {
    return value.filter((flag) => flag !== '"-lc++"' && flag !== "-lc++");
  }

  if (typeof value === "string") {
    return value
      .split(/\s+/)
      .filter((flag) => flag && flag !== '"-lc++"' && flag !== "-lc++")
      .join(" ");
  }

  return value;
}

module.exports = function withIosLinkerCleanup(config) {
  return withXcodeProject(config, (configWithProject) => {
    const buildConfigurations =
      configWithProject.modResults.pbxXCBuildConfigurationSection();

    for (const entry of Object.values(buildConfigurations)) {
      if (!entry || typeof entry !== "object" || !entry.buildSettings) {
        continue;
      }

      const nextFlags = normalizeOtherLdFlags(entry.buildSettings.OTHER_LDFLAGS);
      if (typeof nextFlags !== "undefined") {
        entry.buildSettings.OTHER_LDFLAGS = nextFlags;
      }
    }

    return configWithProject;
  });
};
