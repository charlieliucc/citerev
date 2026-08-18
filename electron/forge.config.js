const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    name: '引用审查轻量版',
    executableName: 'citerev',
    appBundleId: 'com.ccliu.citationreviewer',
    icon: 'assets/icon.ico',
    asar: true,
    // On Windows, the HTML is loaded from resourcesPath; no extra resource needed
    // since index.html is bundled inside the asar (it lives in src/ which is copied
    // into the app by electron-forge).
    extraResource: [],
    // Build for Windows
    platform: 'win32',
    arch: 'x64',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-fuses',
      config: {
        version: FuseVersion.V1,
        [FuseV1Options.RunAsNode]: false,
        [FuseV1Options.EnableCookieEncryption]: true,
        [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
        [FuseV1Options.EnableNodeCliInspectArguments]: false,
        [FuseV1Options.OnlyLoadAppFromAsar]: true,
      },
    },
  ],
};
