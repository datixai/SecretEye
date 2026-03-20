import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, LayoutAnimation, Platform, UIManager } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, doc, getDoc, deleteDoc, updateDoc, orderBy } from "firebase/firestore";
import HomeFooter from "../../components/HomeFooter";

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AdminDevicesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [homeowners, setHomeowners] = useState({}); 
  const [expandedUser, setExpandedUser] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "devices"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const allDevices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const groupedData = {};
      
      // Get unique User IDs from the devices
      const uniqueUserIds = [...new Set(allDevices.map(d => d.userId))];

      // Fetch user details (emails) for each unique ID
      const userMap = {};
      await Promise.all(uniqueUserIds.map(async (uid) => {
        if (!uid) return;
        try {
          const userSnap = await getDoc(doc(db, "users", uid));
          if (userSnap.exists()) {
            userMap[uid] = userSnap.data().email || userSnap.data().fullName || uid;
          } else {
            userMap[uid] = `Unknown (${uid.slice(0,5)})`;
          }
        } catch (e) {
          userMap[uid] = uid;
        }
      }));

      // Group devices by the actual Email/Name found in the 'users' collection
      allDevices.forEach((dev) => {
        const displayName = userMap[dev.userId] || "Unknown User";
        if (!groupedData[displayName]) groupedData[displayName] = [];
        groupedData[displayName].push(dev);
      });
      
      setHomeowners(groupedData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const toggleExpand = (user) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedUser(expandedUser === user ? null : user);
  };

  const toggleDeviceStatus = (id, currentStatus) => {
    const action = currentStatus === "Active" ? "Disable" : "Enable";
    Alert.alert("Confirm", `Are you sure you want to ${action} this device?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: () => updateDoc(doc(db, "devices", id), { 
          status: currentStatus === "Active" ? "Disabled" : "Active" 
        }) 
      }
    ]);
  };

  const confirmDelete = (id) => {
    Alert.alert("Delete Device", "This action is permanent.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", onPress: () => deleteDoc(doc(db, "devices", id)), style: 'destructive' }
    ]);
  };

  const filteredUsers = Object.keys(homeowners).filter(name => 
    name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <LinearGradient colors={["#F0F9FF", "#E0F2FE", "#BAE6FD"]} style={{ flex: 1 }}>
      <View className="flex-1 px-6 pt-16">
        
        <View className="flex-row items-center justify-between mb-6 pt-4">
          <TouchableOpacity onPress={() => router.back()} className="p-3 rounded-full bg-white shadow-md">
            <Ionicons name="arrow-back" size={22} color="#0C4A6E" />
          </TouchableOpacity>
          <View className="items-end">
            <Text className="text-gray-500 text-[10px] font-bold tracking-widest uppercase">Management</Text>
            <Text className="text-gray-900 text-2xl font-black">DEVICE HUB</Text>
          </View>
        </View>

        <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 mb-6 shadow-sm border border-cyan-100">
          <Ionicons name="search" size={20} color="#0EA5E9" />
          <TextInput 
            className="flex-1 ml-3 text-gray-800" 
            placeholder="Search Homeowner Email..." 
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {loading ? (
          <ActivityIndicator color="#0EA5E9" size="large" />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
            {filteredUsers.map((userName) => (
              <View key={userName} className="bg-white rounded-[30px] mb-4 overflow-hidden shadow-sm border border-white">
                
                <TouchableOpacity 
                  onPress={() => toggleExpand(userName)}
                  className={`flex-row items-center p-5 ${expandedUser === userName ? 'bg-cyan-50/50' : ''}`}
                >
                  <View className="w-12 h-12 bg-sky-100 rounded-2xl items-center justify-center">
                    <Ionicons name="person" size={22} color="#0EA5E9" />
                  </View>
                  <View className="ml-4 flex-1">
                    <Text className="text-gray-900 font-bold text-sm" numberOfLines={1}>{userName}</Text>
                    <Text className="text-gray-400 text-[10px] uppercase font-bold">{homeowners[userName].length} Nodes</Text>
                  </View>
                  <Ionicons name={expandedUser === userName ? "chevron-up" : "chevron-down"} size={18} color="#94A3B8" />
                </TouchableOpacity>

                {expandedUser === userName && (
                  <View className="px-5 pb-5 bg-slate-50/30">
                    <View className="h-[1px] bg-gray-100 mb-4" />
                    {homeowners[userName].map((dev) => (
                      <View key={dev.id} className="bg-white rounded-2xl p-4 mb-3 border border-gray-100 shadow-inner">
                        <View className="flex-row justify-between mb-3">
                          <View className="flex-1">
                            <Text className="text-gray-800 font-bold">{dev.name}</Text>
                            <Text className="text-[10px] text-gray-400 font-mono">IP: {dev.ip}</Text>
                          </View>
                          <View className={`px-3 py-1 rounded-full ${dev.status === 'Active' ? 'bg-emerald-500' : 'bg-gray-400'}`}>
                            <Text className="text-white text-[8px] font-black uppercase">{dev.status}</Text>
                          </View>
                        </View>

                        <View className="flex-row gap-2">
                          <TouchableOpacity 
                            onPress={() => toggleDeviceStatus(dev.id, dev.status)}
                            className="flex-1 bg-white border border-gray-200 py-3 rounded-xl items-center"
                          >
                            <Text className="text-gray-600 font-bold text-[10px] uppercase tracking-tighter">
                               {dev.status === 'Active' ? 'Disable Node' : 'Enable Node'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => confirmDelete(dev.id)} className="bg-red-500 px-5 py-3 rounded-xl shadow-sm">
                            <Ionicons name="trash-outline" size={16} color="white" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
      <View className="absolute bottom-0 left-0 right-0">
        <HomeFooter active="Devices" />
      </View>
    </LinearGradient>
  );
}