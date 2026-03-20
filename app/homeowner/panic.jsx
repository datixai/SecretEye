import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Alert, Linking, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { auth, db } from "../../lib/firebase"; // Ensure this path is correct
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import HomeFooter from "../../components/HomeFooter";

export default function PanicScreen() {
  const router = useRouter();
  const [isActivating, setIsActivating] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [isSending, setIsSending] = useState(false);

  // Get current user info for identification
  const user = auth.currentUser;
  const userIdentifier = user?.email || user?.phoneNumber || "Unknown User";

  const triggerPanic = () => {
    setIsActivating(true);
    setCountdown(3);
    
    // Start a 3-second buffer to prevent accidental triggers
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          executeEmergencyProtocols();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const executeEmergencyProtocols = async () => {
    setIsSending(true);
    try {
      // 1. SAVE TO DATABASE (Real-time trigger for Admin)
      // This will be picked up by the Admin's onSnapshot listener immediately
      await addDoc(collection(db, "emergency_alerts"), {
        userId: user?.uid,
        userIdentifier: userIdentifier,
        timestamp: serverTimestamp(),
        status: "UNREAD",
        type: "PANIC_BUTTON",
        priority: "CRITICAL",
      });

      console.log(`Emergency Database Record Created for: ${userIdentifier}`);

      // 2. Ask to connect to Police
      Alert.alert(
        "EMERGENCY BROADCAST SENT",
        `Admin has been notified. User ID: ${userIdentifier}\n\nWould you like to call the Police (15) now?`,
        [
          { 
            text: "NO, I'M SAFE", 
            onPress: () => {
                setIsActivating(false);
                setIsSending(false);
            }, 
            style: "cancel" 
          },
          { 
            text: "YES, CALL 15", 
            onPress: () => {
              setIsActivating(false);
              setIsSending(false);
              Linking.openURL('tel:15');
            },
            style: "destructive" 
          },
        ]
      );
    } catch (error) {
      console.error("Firebase Error:", error);
      Alert.alert("Connection Error", "Failed to alert Admin. Please call 15 manually.");
      setIsActivating(false);
      setIsSending(false);
    }
  };

  return (
    <LinearGradient colors={["#7F1D1D", "#450A0A", "#000000"]} style={{ flex: 1 }}>
      <View className="flex-1 px-8 justify-center items-center">
        
        {/* Header Warning */}
        <View className="items-center mb-12">
          <View className="p-4 bg-red-500/20 rounded-full mb-4">
            <Ionicons name="warning" size={50} color="#F87171" />
          </View>
          <Text className="text-white text-3xl font-black tracking-tighter text-center">
            PANIC MODE
          </Text>
          <Text className="text-red-300 text-center mt-2 font-medium">
            Active User: {userIdentifier}
          </Text>
        </View>

        {/* The Panic Button / Countdown Logic */}
        {!isActivating ? (
          <TouchableOpacity
            onLongPress={triggerPanic}
            delayLongPress={500}
            activeOpacity={0.7}
            className="w-64 h-64 rounded-full bg-red-600 items-center justify-center shadow-2xl border-8 border-red-500/50"
          >
            <View className="items-center">
              <Ionicons name="notifications-outline" size={80} color="white" />
              <Text className="text-white font-black text-xl mt-2">HOLD TO ALARM</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View className="w-64 h-64 rounded-full bg-white items-center justify-center shadow-2xl border-8 border-red-400">
            {isSending ? (
              <ActivityIndicator size="large" color="#DC2626" />
            ) : (
              <>
                <Text className="text-red-600 text-7xl font-black">{countdown}</Text>
                <Text className="text-red-600 font-bold mt-2">NOTIFYING ADMIN...</Text>
              </>
            )}
          </View>
        )}

        {/* Instructions */}
        <Text className="text-gray-400 text-sm mt-12 text-center px-6">
          Pressing this will instantly alert the SecretEye control center and initiate emergency protocols.
        </Text>

        {!isSending && (
            <TouchableOpacity 
                onPress={() => {
                    setIsActivating(false);
                    router.back();
                }}
                className="mt-8 py-3 px-8 rounded-2xl bg-white/10"
            >
                <Text className="text-white font-bold">CANCEL</Text>
            </TouchableOpacity>
        )}
      </View>

      <View className="absolute bottom-0 left-0 right-0">
        <HomeFooter active="Panic" role="homeowner" />
      </View>
    </LinearGradient>
  );
}