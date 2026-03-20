import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";

export default function AlertsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F3F4F6" }}>
      <StatusBar style="light" /> {/* Back Button */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 40,
          paddingTop: 10,
        }}
      >
        {/* ================= HEADER ================= */}
        <LinearGradient
          colors={["#1D4ED8", "#0EA5E9"]}
          style={styles.headerCard}
        >
          {/* Header Row: Back Button + Title + Live Badge */}
          <View style={styles.headerTopRowWithBack}>
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.8}
              style={styles.headerBackButton}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>

            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.headerTitle}>Alert Command Center</Text>
              <Text style={styles.headerSubtitle}>
                Real-Time Security Monitoring
              </Text>
            </View>

            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>

          <View style={styles.systemStatus}>
            <Text style={styles.systemText}>System Status: Active</Text>
            <Text style={styles.systemText}>Sensors: 99.8%</Text>
          </View>
        </LinearGradient>

        {/* ================= STATS GRID ================= */}
        <View style={styles.gridContainer}>
          <View style={[styles.statCard, { backgroundColor: "#2563EB" }]}>
            <Text style={styles.statNumber}>127</Text>
            <Text style={styles.statLabel}>Alerts (24h)</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: "#0891B2" }]}>
            <Text style={styles.statNumber}>2.1s</Text>
            <Text style={styles.statLabel}>Avg Response</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: "#16A34A" }]}>
            <Text style={styles.statNumber}>5</Text>
            <Text style={styles.statLabel}>Active Devices</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: "#059669" }]}>
            <Text style={styles.statNumber}>99.2%</Text>
            <Text style={styles.statLabel}>Delivery Success</Text>
          </View>
        </View>

        {/* ================= DELIVERY CHANNELS ================= */}
        <Text style={styles.sectionTitle}>Alert Delivery Channels</Text>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>SMS Alerts</Text>
            <Text style={styles.activeTag}>ACTIVE</Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.cardSmall}>125 Sent</Text>
            <Text style={styles.cardSmall}>98.4% Success</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Push Notifications</Text>
            <Text style={styles.activeTag}>ACTIVE</Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.cardSmall}>Realtime</Text>
            <Text style={styles.cardSmall}>99.1% Success</Text>
          </View>
        </View>

        {/* ================= SYSTEM CONTROLS ================= */}
        <Text style={styles.sectionTitle}>System Controls</Text>

        <View style={styles.gridContainer}>
          <TouchableOpacity
            style={[styles.controlButton, { backgroundColor: "#DC2626" }]}
          >
            <Text style={styles.controlText}>Emergency Broadcast</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, { backgroundColor: "#111827" }]}
          >
            <Text style={styles.controlText}>Test Alert</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, { backgroundColor: "#F59E0B" }]}
          >
            <Text style={styles.controlText}>Disable Alerts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, { backgroundColor: "#4F46E5" }]}
          >
            <Text style={styles.controlText}>Reset System</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginBottom: 24,
  },

  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },

  headerSubtitle: {
    color: "#DBEAFE",
    fontSize: 13,
    marginTop: 4,
  },

  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#22C55E",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  liveDot: {
    width: 6,
    height: 6,
    backgroundColor: "#fff",
    borderRadius: 3,
    marginRight: 6,
  },

  liveText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },

  systemStatus: {
    backgroundColor: "rgba(255,255,255,0.2)",
    marginTop: 16,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  systemText: {
    color: "#fff",
    fontSize: 12,
  },

  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  statCard: {
    width: "48%",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },

  statNumber: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },

  statLabel: {
    color: "#E0F2FE",
    fontSize: 12,
    marginTop: 6,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#374151",
    marginBottom: 12,
    marginTop: 8,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  cardTitle: {
    fontWeight: "bold",
    fontSize: 14,
    color: "#111827",
  },

  activeTag: {
    color: "#16A34A",
    fontSize: 11,
    fontWeight: "bold",
  },

  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  cardSmall: {
    fontSize: 12,
    color: "#6B7280",
  },

  controlButton: {
    width: "48%",
    borderRadius: 18,
    paddingVertical: 16,
    marginBottom: 16,
    alignItems: "center",
  },

  controlText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
  },
  headerTopRowWithBack: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
});
