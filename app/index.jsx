import { View, Text, Image, TouchableOpacity, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Video } from "expo-av";
import { router } from "expo-router";

export default function Index() {
  return (
    <View className="flex-1 bg-white px-6">
      <StatusBar style="dark" />

      <View
        className={`items-center ${Platform.OS === "ios" ? "mt-20" : "mt-12"}`}
      >
        <View className="w-20 h-20 items-center justify-center">
          <Image
            source={require("../assets/logo.png")}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        </View>

        <Text className=" text-lg font-semibold text-gray-900">
          SecretEye
        </Text>
      </View>

     
      <View className="items-center mt-8">
        <Text className="text-3xl font-bold text-gray-900">The Eye</Text>
        <Text className="text-3xl font-bold text-cyan-400">
          That Never Sleeps
        </Text>
      </View>

      
      <View className="items-center mt-10">
        <Video
          source={require("../assets/aiSecurity.mp4")}
          style={{
            width: "100%",
            height: 260,
            borderRadius: 24,
          }}
          resizeMode="contain"
          shouldPlay
          isLooping
          isMuted
        />
      </View>

      
      <Text className="mt-4 text-center text-gray-500 text-base px-4">
        Smart AI monitoring that protects your home around the clock.
      </Text>

      
      <View className="flex-1 justify-end mb-8">
        <TouchableOpacity
          activeOpacity={0.9}
          className="bg-cyan-400 py-4 rounded-2xl shadow-lg"
          onPress={() => router.push("login")}
        >
          <Text className="text-white text-lg font-semibold text-center">
            Get Started
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
