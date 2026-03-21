import React, { useEffect, useState } from "react";
import {
  ScrollView, View, Text, TouchableOpacity,
  TextInput, Alert, Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter }  from "expo-router";
import {
  collection, getDocs, updateDoc,
  deleteDoc, doc, query, where,
} from "firebase/firestore";
import { db } from "../../lib/firebase";

// NOTE: Admins can only EDIT or DELETE existing homeowners.
// New users must register themselves via the Sign Up screen
// so that Firebase Auth accounts are properly created.

export default function ManageUsers() {
  const router = useRouter();
  const [users,        setUsers]        = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [currentUser,  setCurrentUser]  = useState({ fullName: "", email: "", id: null });

  const fetchUsers = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, "users"), where("role", "==", "homeowner")),
      );
      // FIX: was reading docItem.data().fullname — signup.jsx stores as "fullName" (capital N)
      setUsers(
        snap.docs.map((d) => ({
          id:          d.id,
          fullName:    d.data().fullName   || d.data().fullname || "",  // fallback for old records
          email:       d.data().email      || "",
          phoneNumber: d.data().phoneNumber || "",
          role:        d.data().role        || "homeowner",
        })),
      );
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleEditUser = (user) => {
    setCurrentUser(user);
    setModalVisible(true);
  };

  const saveUser = async () => {
    if (!currentUser.fullName || !currentUser.email) {
      Alert.alert("Error", "Please enter full name and email.");
      return;
    }
    try {
      // FIX: update with fullName (capital N) to match signup.jsx schema
      await updateDoc(doc(db, "users", currentUser.id), {
        fullName: currentUser.fullName,
        email:    currentUser.email,
      });
      setModalVisible(false);
      fetchUsers();
    } catch (err) {
      console.error("Error saving user:", err);
      Alert.alert("Error", "Could not update user.");
    }
  };

  const handleDeleteUser = (userId) =>
    Alert.alert("Delete User", "Are you sure you want to delete this user?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Yes, Delete", style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "users", userId));
            fetchUsers();
          } catch (err) {
            console.error("Error deleting user:", err);
          }
        },
      },
    ]);

  return (
    <View className="flex-1 bg-white px-4 pt-12">

      {/* Header */}
      <View className="flex-row items-start justify-between mb-6 pt-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-3 rounded-full bg-white shadow-lg border border-gray-200"
        >
          <Ionicons name="arrow-back" size={22} color="#0891B2" />
        </TouchableOpacity>
        <View className="flex-1 ml-3">
          <Text className="text-3xl font-extrabold text-cyan-700 mb-1">Manage Users</Text>
          <Text className="text-gray-600 text-sm font-medium">Edit or remove homeowners</Text>
        </View>
      </View>

      {/* Users list */}
      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        {users.length === 0 ? (
          <View className="justify-center items-center py-20">
            <View className="bg-cyan-50 p-6 rounded-full mb-4">
              <Ionicons name="people-outline" size={64} color="#0891B2" />
            </View>
            <Text className="text-gray-600 text-center mt-4 text-lg font-semibold">No homeowners yet</Text>
            <Text className="text-gray-500 text-center mt-2 text-sm leading-5">
              Homeowners register via the Sign Up screen.
            </Text>
          </View>
        ) : (
          users.map((user) => (
            <View
              key={user.id}
              className="bg-white rounded-2xl mb-4 border border-gray-100 shadow-lg p-5"
              style={{ elevation: 4 }}
            >
              <View className="flex-row justify-between">
                <View className="flex-1 pr-3">
                  <View className="flex-row items-center mb-2">
                    <View className="w-10 h-10 bg-cyan-500 rounded-full items-center justify-center mr-3">
                      <Text className="text-white font-bold text-lg">
                        {user.fullName?.charAt(0).toUpperCase() || "?"}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-lg font-bold text-gray-800">{user.fullName || "Unknown User"}</Text>
                      <Text className="text-gray-500 text-sm">{user.email}</Text>
                      {user.phoneNumber ? (
                        <Text className="text-gray-400 text-xs mt-0.5">{user.phoneNumber}</Text>
                      ) : null}
                    </View>
                  </View>
                  <View className="bg-cyan-100 px-3 py-1 rounded-full self-start">
                    <Text className="text-cyan-700 text-xs font-semibold capitalize">{user.role}</Text>
                  </View>
                </View>
                <View className="flex-row gap-3 items-start">
                  <TouchableOpacity
                    onPress={() => handleEditUser(user)}
                    className="bg-blue-50 p-3 rounded-xl border border-blue-200"
                  >
                    <Ionicons name="pencil-outline" size={20} color="#2563EB" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteUser(user.id)}
                    className="bg-red-50 p-3 rounded-xl border border-red-200"
                  >
                    <Ionicons name="trash-outline" size={20} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 pb-8 shadow-2xl">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-bold text-gray-800">Edit Homeowner</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} className="p-2 rounded-full bg-gray-100">
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View className="mb-6">
              <Text className="text-gray-700 font-semibold mb-3 text-base">Full Name</Text>
              <TextInput
                placeholder="Enter full name"
                placeholderTextColor="#9CA3AF"
                className="border border-gray-300 p-4 rounded-xl mb-5 text-base bg-gray-50"
                style={{ borderWidth: 1 }}
                value={currentUser.fullName}
                onChangeText={(t) => setCurrentUser({ ...currentUser, fullName: t })}
              />
              <Text className="text-gray-700 font-semibold mb-3 text-base">Email Address</Text>
              <TextInput
                placeholder="Enter email address"
                placeholderTextColor="#9CA3AF"
                className="border border-gray-300 p-4 rounded-xl text-base bg-gray-50"
                style={{ borderWidth: 1 }}
                keyboardType="email-address"
                value={currentUser.email}
                onChangeText={(t) => setCurrentUser({ ...currentUser, email: t })}
              />
            </View>

            <View className="flex-row gap-4">
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                className="flex-1 py-4 px-6 rounded-2xl bg-gray-100 border border-gray-200"
              >
                <Text className="text-gray-700 font-bold text-center text-base">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveUser}
                className="flex-1 bg-cyan-600 py-4 px-6 rounded-2xl shadow-lg"
              >
                <Text className="text-white font-bold text-center text-base">Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
