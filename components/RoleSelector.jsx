import { TouchableOpacity, Text, View } from "react-native";

export default function RoleSelector({ role, setRole }) {
  return (
    <View className="flex-row gap-4 mt-4">
      {/* HOMEOWNER */}
      <TouchableOpacity
        onPress={() => setRole("homeowner")}
        className={`flex-1 p-4 rounded-2xl border ${
          role === "homeowner"
            ? "bg-cyan-100 border-cyan-400"
            : "border-gray-300"
        }`}
      >
        <Text
          className={`text-center font-semibold ${
            role === "homeowner" ? "text-cyan-600" : "text-gray-600"
          }`}
        >
          Homeowner
        </Text>
      </TouchableOpacity>

      {/* ADMIN */}
      <TouchableOpacity
        onPress={() => setRole("admin")}
        className={`flex-1 p-4 rounded-2xl border ${
          role === "admin" ? "bg-cyan-100 border-cyan-400" : "border-gray-300"
        }`}
      >
        <Text
          className={`text-center font-semibold ${
            role === "admin" ? "text-cyan-600" : "text-gray-600"
          }`}
        >
          Admin
        </Text>
      </TouchableOpacity>
    </View>
  );
}
