import React, { useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../lib/firebase";

export default function ManageUsers() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState({
    fullname: "",
    email: "",
    id: null,
  });

  // Fetch all homeowners
  const fetchUsers = async () => {
    try {
      const q = query(
        collection(db, "users"),
        where("role", "==", "homeowner"),
      );
      const querySnapshot = await getDocs(q);
      const usersList = [];
      querySnapshot.forEach((docItem) => {
        // Add Firestore document ID manually
        usersList.push({
          id: docItem.id,
          fullname: docItem.data().fullname,
          email: docItem.data().email,
          role: docItem.data().role,
        });
      });
      setUsers(usersList);
    } catch (error) {
      console.log("Error fetching users:", error);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Open modal for adding a new user
  const handleAddUser = () => {
    setCurrentUser({ fullname: "", email: "", id: null });
    setModalVisible(true);
  };

  // Open modal for editing an existing user
  const handleEditUser = (user) => {
    setCurrentUser(user);
    setModalVisible(true);
  };

  // Save user (add or edit)
  const saveUser = async () => {
    if (!currentUser.fullname || !currentUser.email) {
      Alert.alert("Error", "Please enter full name and email");
      return;
    }

    try {
      if (currentUser.id) {
        // Editing existing user
        await updateDoc(doc(db, "users", currentUser.id), {
          fullname: currentUser.fullname,
          email: currentUser.email,
        });
      } else {
        // Adding new user
        await addDoc(collection(db, "users"), {
          fullname: currentUser.fullname,
          email: currentUser.email,
          role: "homeowner", // automatically set
        });
      }
      setModalVisible(false);
      fetchUsers(); // refresh list
    } catch (error) {
      console.log("Error saving user:", error);
    }
  };

  // Delete user with confirmation
  const handleDeleteUser = (userId) => {
    Alert.alert("Delete User", "Are you sure you want to delete this user?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Yes, Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "users", userId));
            fetchUsers(); // refresh list
          } catch (error) {
            console.log("Error deleting user:", error);
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-gradient-to-br from-gray-50 to-gray-100 px-4 pt-12">
      {/* Header Section with Back Button */}
      <View className="flex-row items-start justify-between mb-6 pt-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-3 rounded-full bg-white shadow-lg border border-gray-200"
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#0891B2" />
        </TouchableOpacity>

        <View className="flex-1 ml-3">
          <Text className="text-3xl font-extrabold text-cyan-700 mb-1">
            Manage Users
          </Text>
          <Text className="text-gray-600 text-sm font-medium">
            Add, edit, or remove users
          </Text>
        </View>
      </View>

      {/* Add User Button */}
      <TouchableOpacity
        className="mb-6 bg-cyan-600 py-4 px-6 rounded-2xl flex-row items-center justify-center shadow-lg"
        activeOpacity={0.8}
        onPress={handleAddUser}
      >
        <Ionicons
          name="add-circle-outline"
          size={24}
          color="white"
          style={{ marginRight: 10 }}
        />
        <Text className="text-white font-bold text-lg">Add New Homeowner</Text>
      </TouchableOpacity>

      {/* Users List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        className="flex-1 -mx-4 px-4"
      >
        {users.length === 0 ? (
          <View className="flex justify-center items-center py-20">
            <View className="bg-cyan-50 p-6 rounded-full mb-4">
              <Ionicons name="people-outline" size={64} color="#0891B2" />
            </View>
            <Text className="text-gray-600 text-center mt-4 text-lg font-semibold">
              No homeowners yet
            </Text>
            <Text className="text-gray-500 text-center mt-2 text-sm leading-5">
              Start by adding your first homeowner to begin managing your
              community
            </Text>
          </View>
        ) : (
          users.map((user) => (
            <View
              key={user.id}
              className="bg-white rounded-2xl mb-4 overflow-hidden border border-gray-100 shadow-lg p-5"
              style={{ elevation: 4 }}
            >
              <View className="flex-row justify-between">
                <View className="flex-1 pr-3">
                  <View className="flex-row items-center mb-2">
                    <View className="w-10 h-10 bg-cyan-500 rounded-full flex items-center justify-center mr-3">
                      <Text className="text-white font-bold text-lg">
                        {user.fullname && user.fullname.length > 0
                          ? user.fullname.charAt(0).toUpperCase()
                          : "?"}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-lg font-bold text-gray-800">
                        {user.fullname || "Unknown User"}
                      </Text>
                      <Text className="text-gray-500 text-sm mt-1">
                        {user.email || "No email"}
                      </Text>
                    </View>
                  </View>
                  <View className="mt-3 bg-cyan-100 px-3 py-1 rounded-full self-start">
                    <Text className="text-cyan-700 text-xs font-semibold">
                      {user.role && user.role.length > 0
                        ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
                        : "User"}
                    </Text>
                  </View>
                </View>
                <View className="flex-row gap-3 justify-end">
                  <TouchableOpacity
                    onPress={() => handleEditUser(user)}
                    className="bg-blue-50 p-3 rounded-xl border border-blue-200"
                    activeOpacity={0.6}
                  >
                    <Ionicons name="pencil-outline" size={20} color="#2563EB" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteUser(user.id)}
                    className="bg-red-50 p-3 rounded-xl border border-red-200"
                    activeOpacity={0.6}
                  >
                    <Ionicons name="trash-outline" size={20} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Modal for Add / Edit */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 pb-8 shadow-2xl">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-bold text-gray-800">
                {currentUser.id ? "Edit Homeowner" : "Add New Homeowner"}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                className="p-2 rounded-full bg-gray-100"
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Input Fields */}
            <View className="mb-6">
              <Text className="text-gray-700 font-semibold mb-3 text-base">
                Full Name
              </Text>
              <TextInput
                placeholder="Enter full name"
                placeholderTextColor="#9CA3AF"
                className="border border-gray-300 p-4 rounded-xl mb-5 text-base bg-gray-50"
                style={{ borderWidth: 1 }}
                value={currentUser.fullname}
                onChangeText={(text) =>
                  setCurrentUser({ ...currentUser, fullname: text })
                }
              />

              <Text className="text-gray-700 font-semibold mb-3 text-base">
                Email Address
              </Text>
              <TextInput
                placeholder="Enter email address"
                placeholderTextColor="#9CA3AF"
                className="border border-gray-300 p-4 rounded-xl text-base bg-gray-50"
                style={{ borderWidth: 1 }}
                keyboardType="email-address"
                value={currentUser.email}
                onChangeText={(text) =>
                  setCurrentUser({ ...currentUser, email: text })
                }
              />
            </View>

            {/* Action Buttons */}
            <View className="flex-row gap-4">
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                className="flex-1 py-4 px-6 rounded-2xl bg-gray-100 border border-gray-200"
                activeOpacity={0.8}
              >
                <Text className="text-gray-700 font-bold text-center text-base">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveUser}
                className="flex-1 bg-cyan-600 py-4 px-6 rounded-2xl shadow-lg"
                activeOpacity={0.9}
              >
                <Text className="text-white font-bold text-center text-base">
                  {currentUser.id ? "Update" : "Add"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
