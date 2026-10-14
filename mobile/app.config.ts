import type { ExpoConfig } from "expo/config";

const BG = "#0B1220";

const config: ExpoConfig = {
  name: "SecretEye",
  slug: "secreteye",
  version: "2.0.0",
  scheme: "secreteye",
  orientation: "portrait",
  icon: "./assets/images/logo.png",
  userInterfaceStyle: "dark",
  backgroundColor: BG,
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.datixai.secreteye",
  },
  android: {
    package: "com.datixai.secreteye",
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: BG,
      foregroundImage: "./assets/images/android-icon-foreground.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: ["android.permission.CAMERA"],
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
  },
  web: {
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-video",
    // Camera nodes (IP Webcam etc.) are plain http on the home network.
    ["expo-build-properties", { android: { usesCleartextTraffic: true } }],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/logo.png",
        imageWidth: 140,
        resizeMode: "contain",
        backgroundColor: BG,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "SecretEye uses your photos to set profile and trusted-people pictures.",
        cameraPermission: "SecretEye uses the camera to take profile and trusted-people pictures.",
        microphonePermission: false,
      },
    ],
    [
      "expo-media-library",
      {
        photosPermission: "Allow SecretEye to save alert snapshots to your gallery.",
        savePhotosPermission: "Allow SecretEye to save alert snapshots to your gallery.",
        isAccessMediaLocationEnabled: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
