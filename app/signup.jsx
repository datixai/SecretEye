import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Link, useRouter } from "expo-router";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { auth, db } from "../lib/firebase";

import CustomButton from "../components/CustomButton";
import CustomInput from "../components/CustomInput";
import RoleSelector from "../components/RoleSelector";

export default function Signup() {
  const router = useRouter();

  // Form States
  const [fullName,         setFullName]         = useState("");
  const [email,            setEmail]            = useState("");
  const [phoneNumber,      setPhoneNumber]      = useState("");
  const [address,          setAddress]          = useState("");
  const [password,         setPassword]         = useState("");
  const [confirmPassword,  setConfirmPassword]  = useState("");
  const [showPassword,     setShowPassword]     = useState(true);
  const [role,             setRole]             = useState("homeowner");

  // Image States
  const [profileImage,  setProfileImage]  = useState(null);
  const [isProcessing,  setIsProcessing]  = useState(false);
  const [isSigningUp,   setIsSigningUp]   = useState(false);

  // ── STEP 1: CAPTURE & CROP FACE ──────────────────────────────────────────────
  const handleImageAction = async (useCamera = false) => {
    try {
      let result;
      const options = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      };

      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") return Alert.alert("Denied", "Camera access needed.");
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") return Alert.alert("Denied", "Gallery access needed.");
        result = await ImagePicker.launchImageLibraryAsync(options);
      }

      if (!result.canceled && result.assets[0]) {
        setIsProcessing(true);
        const manipulatedImage = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 500, height: 500 } }],
          { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        setProfileImage(manipulatedImage);
        setIsProcessing(false);
        Alert.alert("Face Captured", "Biometric data is ready for registration.");
      }
    } catch (error) {
      setIsProcessing(false);
      Alert.alert("Error", "Image processing failed.");
    }
  };

  // ── STEP 2: SECURE SIGNUP ────────────────────────────────────────────────────
  const handleSignup = async () => {
    if (!fullName || !email || !phoneNumber || !address || !password || !confirmPassword) {
      return Alert.alert("Missing Info", "All fields are required to secure your account.");
    }
    if (!profileImage) {
      return Alert.alert("Biometric Required", "A face photo is mandatory for identity verification.");
    }
    if (password !== confirmPassword) {
      return Alert.alert("Password Mismatch", "Passwords do not match.");
    }

    setIsSigningUp(true);

    try {
      // 1. Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = userCredential.user.uid;

      // 2. Save profile to Firestore (doc ID = uid, consistent with entire app)
      await setDoc(doc(db, "users", uid), {
        uid,
        fullName:     fullName.trim(),
        email:        email.trim().toLowerCase(),
        phoneNumber,
        address,
        role,
        faceReference: profileImage.base64,
        isVerified:   true,
        createdAt:    serverTimestamp(),
      });

      // 3. Force sign-out so user must log in via Login screen
      //    (Firebase auto-logs in after createUser)
      await signOut(auth);

      setIsSigningUp(false);

      // FIX: _layout.jsx won't auto-redirect here because /signup is in the auth
      // group (inAuthGroup=true), so signOut doesn't trigger a redirect.
      // We schedule a fallback redirect via setTimeout in case the user somehow
      // dismisses the Alert without tapping "Go to Login" — without this they
      // would be stuck on /signup while logged out with no escape route.
      const fallbackTimer = setTimeout(() => {
        router.replace("/login");
      }, 8000); // 8s fallback

      Alert.alert(
        "Registration Successful! 🎉",
        "Your biometric profile has been created. Please log in with your email and password.",
        [
          {
            text: "Go to Login",
            onPress: () => {
              clearTimeout(fallbackTimer); // cancel fallback — user already navigating
              router.replace("/login");
            },
          },
        ]
      );

    } catch (error) {
      setIsSigningUp(false);
      console.error("Signup Error:", error.code, error.message);

      let errorMsg = "Could not create account.";
      if (error.code === "auth/email-already-in-use") errorMsg = "This email is already registered.";
      if (error.code === "auth/invalid-email")        errorMsg = "Invalid email format.";
      if (error.code === "auth/weak-password")        errorMsg = "Password should be at least 6 characters.";

      Alert.alert("Signup Failed", errorMsg);
    }
  };

  return (
    <View className="flex-1 bg-white px-6">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        <View className="items-center mt-12">
          <Image source={require("../assets/logo.png")} style={{ width: 50, height: 50 }} />
          <Text className="text-xl font-black text-cyan-600">SecretEye</Text>
        </View>

        <View className="items-center mt-6 mb-8">
          <Text className="text-3xl font-bold text-gray-900">Sign Up</Text>
          <Text className="text-gray-400 text-sm mt-1">Biometric Surveillance Enrollment</Text>
        </View>

        {/* Face Capture */}
        <View className="items-center mb-10">
          <TouchableOpacity
            onPress={() => Alert.alert("Face ID Profile", "Choose image source", [
              { text: "Use Camera",        onPress: () => handleImageAction(true)  },
              { text: "Pick from Gallery", onPress: () => handleImageAction(false) },
              { text: "Cancel",            style: "cancel" },
            ])}
            className={`w-36 h-36 rounded-full items-center justify-center border-2 border-dashed ${
              profileImage ? "border-green-500 bg-green-50" : "border-cyan-400 bg-gray-50"
            }`}
          >
            {isProcessing ? (
              <ActivityIndicator color="#0891B2" />
            ) : profileImage ? (
              <Image source={{ uri: profileImage.uri }} className="w-full h-full rounded-full" />
            ) : (
              <View className="items-center">
                <Ionicons name="camera-outline" size={40} color="#0891B2" />
                <Text className="text-[10px] text-cyan-600 font-bold mt-2 uppercase">Add Face ID</Text>
              </View>
            )}
          </TouchableOpacity>
          {profileImage && (
            <Text className="text-green-600 font-bold text-[10px] mt-2 tracking-widest">BIOMETRIC READY ✓</Text>
          )}
        </View>

        <CustomInput label="Full Name"  value={fullName}     onChangeText={setFullName}     placeholder="John Doe" />
        <CustomInput label="Email"      value={email}        onChangeText={setEmail}        placeholder="john@example.com" autoCapitalize="none" />
        <CustomInput label="Phone"      value={phoneNumber}  onChangeText={setPhoneNumber}  placeholder="+92..." />
        <CustomInput label="Address"    value={address}      onChangeText={setAddress}      placeholder="Installation Address" />

        <View className="relative">
          <CustomInput label="Password" value={password} onChangeText={setPassword} secureTextEntry={showPassword} />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={{ position: "absolute", right: 15, top: 45 }}
          >
            <Ionicons name={showPassword ? "eye-off" : "eye"} size={22} color="gray" />
          </TouchableOpacity>
        </View>

        <CustomInput label="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={showPassword} />

        <RoleSelector role={role} setRole={setRole} />

        {isSigningUp ? (
          <View className="mt-8 items-center">
            <ActivityIndicator size="large" color="#0891B2" />
            <Text className="text-gray-400 mt-2">Encrypting Biometric Data...</Text>
          </View>
        ) : (
          <CustomButton title="CREATE ACCOUNT" styleProps="bg-cyan-600 mt-8 py-4 shadow-lg" onPress={handleSignup} />
        )}

        <View className="flex-row justify-center mt-8 mb-10">
          <Text className="text-gray-500">Already a member? </Text>
          <Link href="/login"><Text className="text-cyan-600 font-bold">Log In</Text></Link>
        </View>

      </ScrollView>
    </View>
  );
}