import { View, Text, ScrollView, TouchableOpacity, Switch } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function SystemControl() {
  const router = useRouter();

  const [systemArmed, setSystemArmed] = useState(true);
  const [detectHuman, setDetectHuman] = useState(true);
  const [activityRecognition, setActivityRecognition] = useState(true);

  return (
    <LinearGradient
      colors={["#F0F9FF", "#E0F2FE", "#BAE6FD"]}
      style={{ flex: 1 }}
    >
      <ScrollView className="px-6 pt-14">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-8">
          <TouchableOpacity
            onPress={() => router.back()}
            className="p-3 rounded-full bg-white shadow-lg border border-gray-200"
          >
            <Ionicons name="arrow-back" size={22} color="#0C4A6E" />
          </TouchableOpacity>

          <Text className="text-2xl font-bold text-gray-800 tracking-wide">
            System Control
          </Text>

          <View className="w-10" />
        </View>

        {/* System Status */}
        <View className="bg-white rounded-3xl p-8 items-center shadow-xl mb-8 border border-gray-200">
          <View
            className={`px-8 py-3 rounded-full mb-4 ${
              systemArmed ? "bg-teal-600" : "bg-gray-500"
            } shadow-lg`}
          >
            <Text className="text-white font-bold text-sm tracking-wider">
              {systemArmed ? "ARMED - AWAY" : "DISARMED"}
            </Text>
          </View>

          <View className="mb-4 mt-2">
            <Text className="text-5xl">{systemArmed ? "🔒" : "🔓"}</Text>
          </View>

          <Text className="text-gray-700 font-semibold text-lg mb-6">
            System is {systemArmed ? "Armed" : "Disarmed"}
          </Text>

          <TouchableOpacity
            onPress={() => setSystemArmed(!systemArmed)}
            className={`px-8 py-4 rounded-2xl shadow-lg ${
              systemArmed
                ? "bg-red-50 border border-red-200"
                : "bg-teal-50 border border-teal-200"
            }`}
            activeOpacity={0.8}
          >
            <Text
              className={`font-bold text-base ${
                systemArmed ? "text-red-700" : "text-teal-700"
              }`}
            >
              {systemArmed ? "Disarm System" : "Arm System"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Monitor Zones */}
        <Text className="text-xl font-bold text-gray-800 mb-4 tracking-wide">
          Monitor Zones
        </Text>

        {/* Detect Human */}
        <View className="bg-white rounded-3xl p-5 flex-row justify-between items-center mb-4 shadow-lg border border-gray-200">
          <View className="flex-row items-center flex-1">
            <View className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center mr-4">
              <Ionicons name="person-outline" size={24} color="white" />
            </View>
            <View>
              <Text className="font-bold text-gray-800 text-base">
                Detect Human
              </Text>
              <Text className="text-sm text-gray-500 mt-1">
                AI-based human detection
              </Text>
            </View>
          </View>
          <Switch
            value={detectHuman}
            onValueChange={setDetectHuman}
            trackColor={{ false: "#D1D5DB", true: "#3B82F6" }}
            thumbColor={detectHuman ? "#FFFFFF" : "#F3F4F6"}
          />
        </View>

        {/* Activity Recognition */}
        <View className="bg-white rounded-3xl p-5 flex-row justify-between items-center mb-8 shadow-lg border border-gray-200">
          <View className="flex-row items-center flex-1">
            <View className="w-12 h-12 bg-purple-500 rounded-2xl flex items-center justify-center mr-4">
              <Ionicons name="eye-outline" size={24} color="white" />
            </View>
            <View>
              <Text className="font-bold text-gray-800 text-base">
                Activity Recognition
              </Text>
              <Text className="text-sm text-gray-500 mt-1">
                Suspicious activity monitoring
              </Text>
            </View>
          </View>
          <Switch
            value={activityRecognition}
            onValueChange={setActivityRecognition}
            trackColor={{ false: "#D1D5DB", true: "#8B5CF6" }}
            thumbColor={activityRecognition ? "#FFFFFF" : "#F3F4F6"}
          />
        </View>

        {/* Emergency Button */}
        <TouchableOpacity
          className="bg-red-600 py-5 rounded-3xl items-center mb-12 shadow-2xl border-2 border-red-500"
          activeOpacity={0.9}
        >
          <View className="flex-row items-center">
            <Text className="text-2xl mr-3">🚨</Text>
            <Text className="text-white font-bold text-lg tracking-wide">
              HOLD TO ALERT AUTHORITIES
            </Text>
          </View>
          <Text className="text-white text-sm mt-2 font-medium">
            Emergency Response System
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}
