import { useRouter, Link } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TouchableOpacity,
  View,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import CustomButton from "../components/CustomButton";
import CustomInput from "../components/CustomInput";
import { auth, db } from "../lib/firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      /** * CRITICAL FIX: 
       * We save the flag FIRST. If we wait until after signIn, 
       * the Layout.jsx triggers a logout before this line ever runs.
       */
      // Inside Login.jsx handleLogin
      await AsyncStorage.setItem("rememberMe", rememberMe ? "true" : "false");

      // 1. Sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );

      // 2. Fetch user role from Firestore
      const userRef = doc(db, "users", userCredential.user.uid);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        const userData = snap.data();
        
        // 3. Navigate based on role
        if (userData.role === "admin") {
          router.replace("/admin/dashboard");
        } else {
          router.replace("/homeowner/dashboard");
        }
      } else {
        // If no user doc exists, we should probably sign out to be safe
        await AsyncStorage.removeItem("rememberMe");
        Alert.alert("Error", "User record not found in database.");
      }
    } catch (error) {
      // If login fails, clear the flag so it doesn't cause loops
      await AsyncStorage.removeItem("rememberMe");
      Alert.alert("Login Failed", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white px-6">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        {/* Logo Section */}
        <View className={`items-center ${Platform.OS === "ios" ? "mt-20" : "mt-12"}`}>
          <View className="w-20 h-20 items-center justify-center">
            <Image
              source={require("../assets/images/logo.png")}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          </View>
          <Text className="text-lg font-semibold text-gray-900 mt-2">SecretEye</Text>
        </View>

        {/* Welcome Text */}
        <View className="items-center mt-10">
          <Text className="text-3xl font-bold text-gray-900">Welcome Back</Text>
          <Text className="text-base text-gray-500 mt-2 text-center px-6">
            Login to continue securing your home with AI surveillance
          </Text>
        </View>

        {/* Form Section */}
        <View className="mt-10">
          <CustomInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <CustomInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="********"
          />

          {/* Remember Me & Forgot Password */}
          <View className="flex-row items-center justify-between mt-2 mb-6">
            <TouchableOpacity 
              onPress={() => setRememberMe(!rememberMe)}
              className="flex-row items-center"
              activeOpacity={0.7}
              disabled={loading}
            >
              <Ionicons 
                name={rememberMe ? "checkbox" : "square-outline"} 
                size={24} 
                color={rememberMe ? "#22d3ee" : "#9ca3af"} 
              />
              <Text className="ml-2 text-gray-600 font-medium">Remember Me</Text>
            </TouchableOpacity>

            <TouchableOpacity>
              <Text className="text-cyan-400 font-semibold">Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#22d3ee" />
          ) : (
            <CustomButton
              title="Login"
              styleProps="bg-cyan-400"
              onPress={handleLogin}
            />
          )}
        </View>

        {/* Footer */}
        <View className="items-center mt-6">
          <Text className="text-gray-500">Don't have an account?</Text>
          <Link href="/signup">
            <Text className="text-cyan-400 font-bold mt-1">Sign Up</Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}