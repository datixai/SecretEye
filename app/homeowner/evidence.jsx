import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Dimensions, ActivityIndicator, Alert, Modal, Pressable } from 'react-native';
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { db, auth } from "../../lib/firebase";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

const { width, height } = Dimensions.get('window');

export default function EvidenceReview() {
  const router = useRouter();
  // CHANGED: use uid instead of email
  const userId = auth.currentUser?.uid;
  
  const [filter, setFilter] = useState('All');
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState('connecting');
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const q = query(
        collection(db, "detections"),
        where("userId", "==", userId),   // CHANGED: was where("userEmail", "in", [...])
        orderBy("timestamp", "desc")
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        setDbStatus('active');
        const docs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setEvidence(docs);
        setLoading(false);
      }, (error) => {
        setDbStatus('error');
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err) {
      setDbStatus('error');
      setLoading(false);
    }
  }, [userId]);  // CHANGED: was [userEmail]

  const saveToCache = async (imageUrl, fileName) => {
    const fileUri = FileSystem.cacheDirectory + `${fileName}.jpg`;
    const base64Code = imageUrl.split("base64,")[1];
    await FileSystem.writeAsStringAsync(fileUri, base64Code, {
      encoding: "base64",
    });
    return fileUri;
  };

  const downloadEvidence = async (imageUrl, fileName) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        Alert.alert("Permission Denied", "Enable Gallery access in settings.");
        return;
      }
      if (imageUrl?.startsWith('data:image')) {
        const cachedUri = await saveToCache(imageUrl, fileName);
        await MediaLibrary.createAssetAsync(cachedUri);
        Alert.alert("Success", "Saved to Gallery!");
      }
    } catch (e) {
      Alert.alert("Error", "Could not save image.");
    }
  };

  const shareEvidence = async (imageUrl, fileName) => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Error", "Sharing is not available on this device");
        return;
      }
      const cachedUri = await saveToCache(imageUrl, fileName);
      await Sharing.shareAsync(cachedUri);
    } catch (e) {
      Alert.alert("Error", "Could not share image.");
    }
  };

  // Helper to get count for categories
  const getCount = (category) => {
    if (category === 'All') return evidence.length;
    return evidence.filter(item => item.type?.toLowerCase() === category.toLowerCase()).length;
  };

  const filteredEvidence = (evidence || []).filter(item => 
    filter === 'All' ? true : item.type?.toLowerCase() === filter.toLowerCase()
  );

  return (
    <LinearGradient colors={["#F0F9FF", "#FFFFFF"]} style={{ flex: 1 }}>
      <View className="flex-1 px-6 pt-16">
        
        {/* Status Badge */}
        <View className="flex-row justify-center mb-4">
          <View className={`px-4 py-1.5 rounded-full flex-row items-center ${dbStatus === 'active' ? 'bg-emerald-100' : 'bg-rose-100'}`}>
            <View className={`w-2 h-2 rounded-full mr-2 ${dbStatus === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <Text className={`text-[10px] font-bold ${dbStatus === 'active' ? 'text-emerald-700' : 'text-rose-700'}`}>
              {dbStatus === 'active' ? 'SYSTEM ONLINE' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <TouchableOpacity onPress={() => router.back()} className="p-3 bg-white rounded-2xl shadow-sm border border-gray-100">
            <Ionicons name="arrow-back" size={24} color="#0891B2" />
          </TouchableOpacity>
          <Text className="text-2xl font-black text-cyan-900">Evidence Hub</Text>
          <View className="w-10" /> 
        </View>

        {/* Filters with Dynamic Counts */}
        <View className="mb-6">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {['All', 'Weapon', 'Stranger', 'Climbing'].map((item) => (
              <TouchableOpacity 
                key={item}
                onPress={() => setFilter(item)}
                className={`mr-3 px-5 py-2 rounded-full border ${filter === item ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'}`}
              >
                <Text className={`font-bold text-xs ${filter === item ? 'text-white' : 'text-gray-600'}`}>
                  {item} ({getCount(item)})
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#0891B2" className="mt-20" />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            <View className="flex-row flex-wrap justify-between">
              {filteredEvidence.map((item) => {
                const dateObj = item.timestamp?.toDate ? item.timestamp.toDate() : null;
                const formattedDate = dateObj ? dateObj.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' }) : "";
                const formattedTime = dateObj ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recent";

                return (
                  <View key={item.id} style={{ width: (width - 60) / 2 }} className="bg-white rounded-3xl mb-6 shadow-sm border border-gray-100 overflow-hidden">
                    
                    {/* Image Preview */}
                    <TouchableOpacity 
                      onPress={() => setSelectedImage(item.imageUrl)}
                      activeOpacity={0.9}
                      className="h-32 bg-slate-200 relative"
                    >
                      {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} className="w-full h-full" resizeMode="cover" />
                      ) : (
                        <View className="flex-1 items-center justify-center">
                          <Ionicons name="image-outline" size={30} color="#94A3B8" />
                        </View>
                      )}
                      <View className="absolute bottom-2 right-2 bg-black/40 p-1 rounded-md">
                          <Ionicons name="expand-outline" size={12} color="white" />
                      </View>
                    </TouchableOpacity>

                    <View className="p-3">
                      <Text className="text-slate-900 font-bold text-xs" numberOfLines={1}>{item.type || 'Alert'}</Text>
                      
                      {/* Date & Time Display */}
                      <View className="mt-1 mb-3">
                        <Text className="text-gray-500 text-[10px] font-medium">{formattedDate}</Text>
                        <Text className="text-gray-400 text-[9px]">{formattedTime}</Text>
                      </View>
                      
                      {/* Action Buttons */}
                      <View className="flex-row justify-between">
                          <TouchableOpacity 
                              onPress={() => downloadEvidence(item.imageUrl, item.id)}
                              className="bg-cyan-50 p-2 rounded-lg flex-1 mr-1 items-center"
                          >
                              <Ionicons name="download-outline" size={16} color="#0891B2" />
                          </TouchableOpacity>
                          <TouchableOpacity 
                              onPress={() => shareEvidence(item.imageUrl, item.id)}
                              className="bg-slate-50 p-2 rounded-lg flex-1 ml-1 items-center"
                          >
                              <Ionicons name="share-social-outline" size={16} color="#475569" />
                          </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {/* FULL SCREEN MODAL */}
      <Modal visible={!!selectedImage} transparent={true} animationType="fade">
        <Pressable className="flex-1 bg-black/95 justify-center items-center" onPress={() => setSelectedImage(null)}>
            <TouchableOpacity onPress={() => setSelectedImage(null)} className="absolute top-12 right-6 z-10 p-2 bg-white/20 rounded-full">
                <Ionicons name="close" size={28} color="white" />
            </TouchableOpacity>
            {selectedImage && <Image source={{ uri: selectedImage }} style={{ width: width, height: height * 0.7 }} resizeMode="contain" />}
            <Text className="text-white/50 text-xs mt-4">Tap anywhere to close</Text>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}