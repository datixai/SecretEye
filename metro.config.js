const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Tell Metro to bundle .onnx and .tflite files as binary assets
// Without this, Metro throws "unable to resolve module" for model files
config.resolver.assetExts.push("onnx", "tflite", "bin");

module.exports = withNativeWind(config, { input: "./global.css" });