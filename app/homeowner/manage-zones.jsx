import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

export default function ManageZones() {
  const router = useRouter();
  const zones = [
    { id: 1, name: "Front Gate", status: "High Sensitivity" },
    { id: 2, name: "Backyard Fence", status: "Detection Only" },
    { id: 3, name: "Garage", status: "Active" },
  ];

  return (
    <LinearGradient colors={["#F0F9FF", "#FFFFFF"]} style={{ flex: 1 }}>
      <View className="flex-1 px-6 pt-16">
        <View className="flex-row items-center mb-8">
          <TouchableOpacity onPress={() => router.back()} className="p-2 mr-4 bg-white rounded-xl shadow-sm">
            <Ionicons name="arrow-back" size={24} color="#0891B2" />
          </TouchableOpacity>
          <Text className="text-2xl font-black text-cyan-900">Security Zones</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {zones.map((zone) => (
            <TouchableOpacity key={zone.id} className="bg-white p-5 rounded-3xl mb-4 flex-row items-center justify-between shadow-sm border border-cyan-50">
              <View className="flex-row items-center">
                <View className="p-3 bg-cyan-100 rounded-2xl mr-4">
                  <Ionicons name="map-outline" size={24} color="#0891B2" />
                </View>
                <View>
                  <Text className="text-lg font-bold text-slate-800">{zone.name}</Text>
                  <Text className="text-cyan-600 text-xs font-medium uppercase tracking-wider">{zone.status}</Text>
                </View>
              </View>
              <Ionicons name="settings-sharp" size={20} color="#94A3B8" />
            </TouchableOpacity>
          ))}

          <TouchableOpacity className="border-2 border-dashed border-cyan-200 rounded-3xl p-8 items-center justify-center bg-cyan-50/30 mt-4">
            <Ionicons name="add-circle-outline" size={32} color="#0891B2" />
            <Text className="text-cyan-800 font-bold mt-2">Create New Zone</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </LinearGradient>
  );
}