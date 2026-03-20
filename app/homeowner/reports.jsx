import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

export default function ReportsScreen() {
  const router = useRouter();

  const alerts = [
    { id: 1, type: "Weapon Detected", time: "2m ago", severity: "High" },
    { id: 2, type: "Unknown Person", time: "1h ago", severity: "Medium" },
    { id: 3, type: "Motion - Garage", time: "4h ago", severity: "Low" },
  ];

  return (
    <LinearGradient colors={["#F0F9FF", "#FFFFFF"]} style={{ flex: 1 }}>
      <View className="flex-1 px-6 pt-16">
        <View className="flex-row items-center justify-between mb-8">
          <TouchableOpacity onPress={() => router.back()} className="p-2 bg-white rounded-xl shadow-sm">
            <Ionicons name="arrow-back" size={24} color="#0891B2" />
          </TouchableOpacity>
          <Text className="text-2xl font-black text-cyan-900">Security Reports</Text>
          <TouchableOpacity className="p-2 bg-white rounded-xl shadow-sm">
            <Ionicons name="filter-outline" size={24} color="#0891B2" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {alerts.map((alert) => (
            <View key={alert.id} className="bg-white p-5 rounded-[30px] mb-4 shadow-sm border border-gray-100">
              <View className="flex-row justify-between items-start mb-2">
                <View className={`px-3 py-1 rounded-full ${alert.severity === 'High' ? 'bg-red-100' : 'bg-orange-100'}`}>
                  <Text className={`text-[10px] font-bold ${alert.severity === 'High' ? 'text-red-600' : 'text-orange-600'}`}>
                    {alert.severity} PRIORITY
                  </Text>
                </View>
                <Text className="text-gray-400 text-xs">{alert.time}</Text>
              </View>
              <Text className="text-lg font-bold text-slate-900">{alert.type}</Text>
              <Text className="text-gray-500 text-sm mt-1">AI detected suspicious activity at the main gate.</Text>
              <TouchableOpacity className="mt-4 flex-row items-center bg-cyan-50 self-start px-4 py-2 rounded-xl">
                <Ionicons name="play-circle" size={18} color="#0891B2" />
                <Text className="text-cyan-700 font-bold text-xs ml-2">Review Evidence</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>
    </LinearGradient>
  );
}