import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView,
  Platform, Text, TouchableOpacity, View,
} from "react-native";
import CustomButton from "../components/CustomButton";
import CustomInput from "../components/CustomInput";
import { auth } from "../lib/firebase";

export default function Login() {
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [loading,    setLoading]    = useState(false);

  // Default true — user stays logged in unless they explicitly uncheck this.
  // Previously defaulted to false which forced re-login on every app open.
  const [rememberMe, setRememberMe] = useState(true);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      // Save rememberMe BEFORE signIn so _layout.jsx reads the correct value
      // when onAuthStateChanged fires.
      await AsyncStorage.setItem("rememberMe", rememberMe ? "true" : "false");

      // KEY FIX: set a "just logged in" flag so _layout.jsx knows this
      // onAuthStateChanged event came from a FRESH LOGIN, not a cold-start
      // auto-login. Without this flag, _layout.jsx's rememberMe check runs
      // immediately after login and signs the user out when rememberMe=false
      // — making it impossible to log in with "Remember Me" unchecked.
      await AsyncStorage.setItem("justLoggedIn", "true");

      // Authenticate only — _layout.jsx handles all routing via onAuthStateChanged
      await signInWithEmailAndPassword(auth, email, password);

    } catch (error) {
      // Clean up flags on failure so they don't affect the next attempt
      await AsyncStorage.removeItem("rememberMe");
      await AsyncStorage.removeItem("justLoggedIn");
      Alert.alert("Login Failed", error.message);
      setLoading(false);
    }
    // setLoading(false) is NOT in finally — on success the component unmounts
    // (navigated away) so resetting state is unnecessary.
  };

  return (
    <View className="flex-1 bg-white px-6">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        {/* Logo */}
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

        {/* Welcome */}
        <View className="items-center mt-10">
          <Text className="text-3xl font-bold text-gray-900">Welcome Back</Text>
          <Text className="text-base text-gray-500 mt-2 text-center px-6">
            Login to continue securing your home with AI surveillance
          </Text>
        </View>

        {/* Form */}
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

          {/* Remember Me + Forgot Password */}
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
            <CustomButton title="Login" styleProps="bg-cyan-400" onPress={handleLogin} />
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