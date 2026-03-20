import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Vibration, Platform } from 'react-native';
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { db } from "../../lib/firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import HomeFooter from "../../components/HomeFooter";

export default function AdminPanicScreen() {
  const router = useRouter();
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [systemStatus, setSystemStatus] = useState("SECURE");

  useEffect(() => {
    const q = query(
      collection(db, "alerts"),
      orderBy("timestamp", "desc"),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const alerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveAlerts(alerts);
      
      const hasEmergency = alerts.some(a => a.status === "EMERGENCY");
      if (hasEmergency) {
        setSystemStatus("CRITICAL");
        Vibration.vibrate([500, 200, 500]); 
      } else {
        setSystemStatus("SECURE");
      }
    });

    return () => unsubscribe();
  }, []);

  const triggerGlobalSiren = () => {
    Alert.alert("Confirm Action", "This will activate sirens on ALL connected hardware nodes.", [
      { text: "Cancel", style: "cancel" },
      { text: "EXECUTE", onPress: () => console.log("Global Siren Deployed"), style: 'destructive' }
    ]);
  };

  return (
    <LinearGradient 
      // Matching homeowner theme: Sky blue gradients
      colors={systemStatus === "CRITICAL" ? ["#FEE2E2", "#FECACA", "#FCA5A5"] : ["#F0F9FF", "#E0F2FE", "#BAE6FD"]} 
      style={{ flex: 1 }}
    >
      <View className="flex-1 px-6 pt-16">
        
        {/* Header with Back Button */}
        <View className="flex-row items-center justify-between mb-8 pt-4">
          <TouchableOpacity
            onPress={() => router.back()}
            className="p-3 rounded-full bg-white shadow-md border border-gray-100"
          >
            <Ionicons name="arrow-back" size={22} color="#0C4A6E" />
          </TouchableOpacity>
          <View className="items-end">
            <Text className="text-gray-500 text-[10px] font-bold tracking-widest uppercase">Response Hub</Text>
            <Text className="text-gray-900 text-2xl font-black">PANIC FEED</Text>
          </View>
        </View>

        {/* Global Status Card - Matching Homeowner style */}
        <View className="bg-white rounded-[32px] p-6 mb-8 items-center shadow-xl border border-white/50">
          <Text className="text-gray-400 text-[10px] font-bold uppercase tracking-[4px] mb-2">System State</Text>
          <View className="flex-row items-center">
            <View className={`w-3 h-3 rounded-full mr-3 ${systemStatus === "CRITICAL" ? 'bg-red-500' : 'bg-emerald-500'}`} />
            <Text className={`text-4xl font-black ${systemStatus === "CRITICAL" ? 'text-red-600' : 'text-emerald-600'}`}>
              {systemStatus}
            </Text>
          </View>
        </View>

        {/* Action Grid */}
        <Text className="text-gray-500 font-bold mb-4 uppercase text-[10px] tracking-widest ml-2">Admin Countermeasures</Text>
        <View className="flex-row gap-4 mb-8">
          <TouchableOpacity 
            onPress={triggerGlobalSiren}
            className="flex-1 bg-red-500 h-28 rounded-3xl items-center justify-center shadow-lg border-b-4 border-red-700"
          >
            <Ionicons name="megaphone" size={28} color="white" />
            <Text className="text-white font-black mt-2 text-xs">GLOBAL SIREN</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className="flex-1 bg-cyan-600 h-28 rounded-3xl items-center justify-center shadow-lg border-b-4 border-cyan-800"
          >
            <Ionicons name="call" size={28} color="white" />
            <Text className="text-white font-black mt-2 text-xs">POLICE LINK</Text>
          </TouchableOpacity>
        </View>

        {/* Incident Feed */}
        <Text className="text-gray-500 font-bold mb-4 uppercase text-[10px] tracking-widest ml-2">Live Incidents</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          {activeAlerts.length > 0 ? activeAlerts.map((alert) => (
            <View key={alert.id} className="bg-white rounded-2xl p-4 mb-4 flex-row items-center shadow-sm border border-gray-100">
              <View className={`w-1.5 h-10 rounded-full mr-4 ${alert.status === "EMERGENCY" ? 'bg-red-500' : 'bg-cyan-400'}`} />
              <View className="flex-1">
                <Text className="text-gray-800 font-bold">{alert.userName || "Resident"}</Text>
                <Text className="text-gray-400 text-xs">{alert.location || "Main Property"}</Text>
              </View>
              <TouchableOpacity className="bg-gray-100 px-4 py-2 rounded-xl">
                <Text className="text-gray-600 text-[10px] font-bold uppercase">Details</Text>
              </TouchableOpacity>
            </View>
          )) : (
            <Text className="text-center text-gray-400 italic mt-4">No active alerts recorded.</Text>
          )}
        </ScrollView>
      </View>

      {/* Persistent Footer */}
      <View className="absolute bottom-0 left-0 right-0">
        <HomeFooter active="Panic" />
      </View>
    </LinearGradient>
  );
}