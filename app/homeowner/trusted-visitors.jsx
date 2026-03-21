import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  Switch, Modal, TextInput, ActivityIndicator, Alert,
} from "react-native";
import { Ionicons }       from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter }      from "expo-router";
import * as ImagePicker   from "expo-image-picker";
// FIX: was calling getAuth() locally — use shared auth from lib/firebase
import { db, auth } from "../../lib/firebase";
import {
  collection, query, where, onSnapshot,
  addDoc, deleteDoc, updateDoc, doc, serverTimestamp,
} from "firebase/firestore";

export default function TrustedVisitors() {
  const router = useRouter();
  // FIX: use uid as homeownerId — consistent with the rest of the app and with backend
  const userId = auth.currentUser?.uid;

  const [visitors,    setVisitors]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [modalVisible,setModalVisible]= useState(false);

  const [editingId,   setEditingId]   = useState(null);
  const [name,        setName]        = useState("");
  const [relation,    setRelation]    = useState("Family");
  const [image,       setImage]       = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    // FIX: was where("homeownerId", "==", userEmail) — now uses uid
    const q = query(
      collection(db, "trusted_visitors"),
      where("homeownerId", "==", userId),
    );

    const unsub = onSnapshot(q, (snap) => {
      setVisitors(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, [userId]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Camera roll access needed.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:    ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect:        [1, 1],
      quality:       0.5,
      base64:        true,
    });
    if (!result.canceled) {
      setImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleSaveVisitor = async () => {
    if (!name.trim()) { Alert.alert("Error", "Please enter a name."); return; }

    setIsUploading(true);
    try {
      const data = {
        name,
        relation,
        image:       image || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
        homeownerId: userId,   // FIX: uid not email
        alerts:      false,
        updatedAt:   serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, "trusted_visitors", editingId), data);
      } else {
        await addDoc(collection(db, "trusted_visitors"), { ...data, createdAt: serverTimestamp() });
      }
      closeModal();
    } catch (err) {
      console.error("Trusted visitor save error:", err);
      Alert.alert("Error", "Could not save visitor.");
    } finally {
      setIsUploading(false);
    }
  };

  const toggleAlerts = (id, current) =>
    updateDoc(doc(db, "trusted_visitors", id), { alerts: !current });

  const confirmDelete = (id) =>
    Alert.alert("Delete", "Remove this visitor?", [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteDoc(doc(db, "trusted_visitors", id)) },
    ]);

  const openEditModal = (v) => {
    setEditingId(v.id);
    setName(v.name);
    setRelation(v.relation);
    setImage(v.image);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingId(null);
    setName("");
    setRelation("Family");
    setImage(null);
  };

  return (
    <LinearGradient colors={["#F0F9FF", "#E0F2FE", "#BAE6FD", "#7DD3FC"]} style={{ flex: 1 }}>
      <ScrollView className="px-6" contentContainerStyle={{ paddingTop: 60, paddingBottom: 120 }}>

        {/* Header */}
        <View className="flex-row items-center justify-between mb-8">
          <View>
            <Text className="text-4xl font-black text-cyan-900 tracking-tighter">Visitors</Text>
            <Text className="text-cyan-700 font-medium">Trusted White-list</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} className="p-3 rounded-2xl bg-white shadow-xl">
            <Ionicons name="arrow-back" size={26} color="#0C4A6E" />
          </TouchableOpacity>
        </View>

        {/* Add button */}
        <TouchableOpacity
          onPress={() => setModalVisible(true)}
          className="bg-white p-5 rounded-[30px] shadow-sm flex-row items-center justify-between mb-8 border border-white"
        >
          <View className="flex-row items-center">
            <View className="bg-cyan-100 p-2 rounded-xl mr-3">
              <Ionicons name="person-add" size={20} color="#0891B2" />
            </View>
            <Text className="font-bold text-slate-800">Add Trusted Member</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
        </TouchableOpacity>

        {/* Visitor list */}
        {loading ? (
          <ActivityIndicator color="#0891B2" />
        ) : visitors.length === 0 ? (
          <View className="items-center p-10 bg-white/60 rounded-3xl border border-dashed border-cyan-200">
            <Ionicons name="people-outline" size={40} color="#CBD5E1" />
            <Text className="text-slate-400 text-center mt-4 font-medium">No trusted visitors yet.</Text>
            <Text className="text-slate-300 text-center text-xs mt-1">Add people above to whitelist them.</Text>
          </View>
        ) : (
          visitors.map((item) => (
            <View key={item.id} className="bg-white/80 rounded-[35px] p-5 mb-4 shadow-sm border border-white">
              <View className="flex-row items-center">
                <Image source={{ uri: item.image }} className="w-14 h-14 rounded-2xl mr-4" />
                <View className="flex-1">
                  <Text className="font-bold text-slate-800 text-lg">{item.name}</Text>
                  <Text className="text-cyan-600 font-bold text-[10px] uppercase">{item.relation}</Text>
                </View>
                <View className="flex-row">
                  <TouchableOpacity onPress={() => openEditModal(item)} className="p-2 mr-1">
                    <Ionicons name="pencil" size={18} color="#0C4A6E" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDelete(item.id)} className="p-2">
                    <Ionicons name="trash" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
              <View className="mt-4 pt-4 border-t border-slate-100 flex-row justify-between items-center">
                <Text className="text-xs font-bold text-slate-500">Enable Security Alerts</Text>
                <Switch
                  value={item.alerts}
                  onValueChange={() => toggleAlerts(item.id, item.alerts)}
                  trackColor={{ false: "#CBD5E1", true: "#0891B2" }}
                />
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add / Edit modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-[40px] p-8 pb-12">
            <Text className="text-2xl font-black text-slate-900 mb-6">Visitor Details</Text>

            <TouchableOpacity onPress={pickImage} className="items-center mb-6">
              <View className="w-24 h-24 bg-slate-100 rounded-[30px] items-center justify-center border-2 border-dashed border-slate-300">
                {image ? (
                  <Image source={{ uri: image }} className="w-24 h-24 rounded-[30px]" />
                ) : (
                  <Ionicons name="camera" size={32} color="#94A3B8" />
                )}
              </View>
              <Text className="text-cyan-600 font-bold text-xs mt-2">Upload Face Photo</Text>
            </TouchableOpacity>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Full Name"
              className="bg-slate-50 p-4 rounded-2xl mb-4 font-bold"
            />

            <View className="flex-row gap-2 mb-8">
              {["Family", "Friend", "Work"].map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setRelation(type)}
                  className={`flex-1 py-3 rounded-xl ${relation === type ? "bg-cyan-600" : "bg-slate-100"}`}
                >
                  <Text className={`text-center font-bold text-xs ${relation === type ? "text-white" : "text-slate-500"}`}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              disabled={isUploading}
              onPress={handleSaveVisitor}
              className="bg-cyan-600 p-5 rounded-2xl"
            >
              {isUploading
                ? <ActivityIndicator color="white" />
                : <Text className="text-white text-center font-black text-lg">Save Visitor</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={closeModal} className="mt-4">
              <Text className="text-slate-400 text-center font-bold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}
