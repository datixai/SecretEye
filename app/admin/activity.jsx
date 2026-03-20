import React, { useState, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import HomeFooter from "../../components/HomeFooter";

export default function AdminActivityScreen() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("email", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(userList);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.fullName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderUserItem = ({ item }) => (
    <View className="bg-white rounded-[24px] p-4 mb-3 shadow-sm border border-white/50">
      <View className="flex-row items-center">
        {/* Avatar/Icon Circle */}
        <View className="w-10 h-10 bg-cyan-50 rounded-full items-center justify-center border border-cyan-100">
          <Ionicons name="person" size={18} color="#0891B2" />
        </View>
        
        {/* User Info */}
        <View className="ml-3 flex-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-gray-900 font-bold text-sm" numberOfLines={1}>
              {item.fullName || "Unnamed User"}
            </Text>
            <View className="bg-cyan-500 px-2 py-0.5 rounded-lg">
              <Text className="text-white text-[8px] font-black uppercase italic">
                {item.role || "User"}
              </Text>
            </View>
          </View>
          
          <Text className="text-gray-500 text-[11px] mt-0.5" numberOfLines={1}>
            {item.email}
          </Text>
        </View>
      </View>

      <View className="h-[1px] bg-gray-50 my-3" />

      {/* Contact Row */}
      <View className="flex-row justify-between items-center">
        <View className="flex-row items-center">
          <Ionicons name="call-outline" size={12} color="#94A3B8" />
          <Text className="text-gray-400 text-[11px] ml-1.5 font-medium">
            {item.phoneNumber || item.phone || "No Phone"}
          </Text>
        </View>
        <TouchableOpacity className="bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
           <Text className="text-cyan-700 font-bold text-[10px]">MANAGE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <LinearGradient colors={["#F0F9FF", "#E0F2FE", "#BAE6FD"]} style={{ flex: 1 }}>
      <View className="flex-1 px-6 pt-16">
        
        {/* Header Section */}
        <View className="flex-row items-center justify-between mb-4 pt-4">
          <TouchableOpacity 
            onPress={() => router.back()} 
            className="p-3 rounded-full bg-white shadow-md border border-gray-50"
          >
            <Ionicons name="arrow-back" size={20} color="#0C4A6E" />
          </TouchableOpacity>
          <View className="items-end">
            <Text className="text-gray-500 text-[10px] font-bold tracking-widest uppercase">Admin</Text>
            <Text className="text-gray-900 text-2xl font-black">USERS</Text>
          </View>
        </View>

        {/* Compact Stats & Search Container */}
        <View className="flex-row gap-3 mb-6">
          {/* Total Counter Card - Much smaller now */}
          <View className="bg-white px-4 py-3 rounded-3xl border border-white shadow-sm flex-row items-center">
             <Ionicons name="people" size={20} color="#0891B2" />
             <View className="ml-3">
               <Text className="text-gray-400 text-[8px] font-bold uppercase">Total</Text>
               <Text className="text-gray-900 font-black text-lg leading-tight">{users.length}</Text>
             </View>
          </View>

          {/* Search Input - Expanded to fill space */}
          <View className="flex-1 flex-row items-center bg-white rounded-3xl px-4 border border-white shadow-sm">
            <Ionicons name="search" size={18} color="#94A3B8" />
            <TextInput 
              className="flex-1 ml-2 text-gray-800 text-sm" 
              placeholder="Find user..." 
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {loading ? (
          <View className="flex-1 justify-center"><ActivityIndicator color="#0EA5E9" size="large" /></View>
        ) : (
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            renderItem={renderUserItem}
            contentContainerStyle={{ paddingBottom: 140 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text className="text-center text-gray-400 italic mt-10">No users found.</Text>
            }
          />
        )}
      </View>

      {/* Sticky Footer */}
      <View className="absolute bottom-0 left-0 right-0">
        <HomeFooter active="Activity" />
      </View>
    </LinearGradient>
  );
}