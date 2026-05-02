/**
 * SecretEye — homeowner/devices.jsx  v7 (Direct Stream)
 *
 * ARCHITECTURE:
 *   devices.jsx polls the IP camera DIRECTLY — zero Flask dependency for preview.
 *   Flask runs AI in the background independently and writes to Firestore.
 *
 *   IP Webcam (phone): http://IP:8080  → polls /shot.jpg directly
 *   Hikvision RTSP:    rtsp://...      → shows "View on web monitor" message
 *                                         (RTSP not supported in React Native Image)
 *   HTTP camera:       http://IP:PORT  → polls /shot.jpg directly
 *
 *   Flask server polls same URL for AI → detections → Firestore → Activity screen
 *   Flask /monitor web page shows AI stream with bounding boxes
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  addDoc, collection, deleteDoc, doc,
  onSnapshot, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image,
  KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import HomeFooter from "../../components/HomeFooter";
import { auth, db } from "../../lib/firebase";

// ─── Flask server — only needed for /monitor web page + AI processing ─────────
// devices.jsx no longer calls Flask for the stream preview
const FLASK_SERVER = "http://192.168.1.162:5000";

// Snapshot poll interval
const POLL_MS = 300;

// ─── Build direct snapshot URL from camera IP ─────────────────────────────────
// Determines the correct snapshot URL based on what the user entered.
//
// IP Webcam (Android app) serves these endpoints:
//   /shot.jpg  → single JPEG snapshot (what we poll)
//   /video     → MJPEG stream (React Native Image can't consume)
//
// Rules:
//   If IP starts with rtsp:// → cannot stream directly, show message
//   If IP already ends with .jpg or .jpeg → use as-is
//   If IP starts with http:// or https:// → append /shot.jpg
//   If IP is just an address like 192.168.1.88:8080 → prepend http:// + append /shot.jpg
function buildSnapshotUrl(ip: string): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();

  // RTSP cannot be consumed by React Native Image
  if (trimmed.startsWith("rtsp://")) return null;

  // Already a direct image URL
  if (trimmed.match(/\.(jpg|jpeg|png)(\?.*)?$/i)) {
    return trimmed;
  }

  // Full HTTP URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const base = trimmed.replace(/\/$/, "");
    return `${base}/shot.jpg`;
  }

  // Just IP:PORT — prepend http://
  return `http://${trimmed}/shot.jpg`;
}

// ─── Direct Camera Stream View ────────────────────────────────────────────────
// Polls the IP camera's /shot.jpg endpoint directly.
// No Flask involved — this is a direct connection to the camera.
function DirectStreamView({ device, style }) {
  const [frameUri,    setFrameUri]    = useState(null);
  const [connected,   setConnected]   = useState(false);
  const [error,       setError]       = useState(false);
  const cancelledRef = useRef(false);
  const timerRef     = useRef(null);
  const errorCountRef= useRef(0);

  const snapshotUrl = buildSnapshotUrl(device.ip);
  const isRTSP      = device.ip?.trim().startsWith("rtsp://");

  useEffect(() => {
    cancelledRef.current = false;
    setError(false);
    setConnected(false);
    errorCountRef.current = 0;

    if (device.status !== "Active" || !snapshotUrl) {
      setFrameUri(null);
      return;
    }

    const poll = () => {
      if (cancelledRef.current) return;
      // Cache-bust with timestamp so Image always fetches fresh
      const uri = `${snapshotUrl}?t=${Date.now()}`;
      setFrameUri(uri);
      timerRef.current = setTimeout(poll, POLL_MS);
    };

    poll();
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [device.id, device.status, snapshotUrl]);

  // RTSP cameras cannot stream directly in React Native
  if (isRTSP) {
    return (
      <View style={[style, styles.centred, { backgroundColor: "#0f172a" }]}>
        <Ionicons name="desktop-outline" size={32} color="#7C3AED" />
        <Text style={[styles.offlineTxt, { color: "#7C3AED", marginTop: 10 }]}>
          RTSP Camera
        </Text>
        <Text style={styles.rtspHint}>
          View AI stream in browser:{"\n"}
          {FLASK_SERVER}/monitor
        </Text>
      </View>
    );
  }

  if (device.status !== "Active") {
    return (
      <View style={[style, styles.centred, { backgroundColor: "#0f172a" }]}>
        <Ionicons name="videocam-off-outline" size={36} color="#94a3b8" />
        <Text style={styles.offlineTxt}>Camera Inactive</Text>
      </View>
    );
  }

  if (!frameUri) {
    return (
      <View style={[style, styles.centred, { backgroundColor: "#0f172a" }]}>
        <ActivityIndicator color="#0891B2" />
        <Text style={styles.offlineTxt}>Connecting…</Text>
      </View>
    );
  }

  return (
    <View style={[style, { backgroundColor: "#0f172a" }]}>
      <Image
        source={{
          uri: frameUri,
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onLoad={() => { setConnected(true); setError(false); errorCountRef.current = 0; }}
        onError={() => {
          errorCountRef.current += 1;
          if (errorCountRef.current > 3) setError(true);
        }}
      />

      {/* Live badge — green when connected, yellow when trying */}
      <View style={[styles.liveBadge,
        { backgroundColor: connected ? "#16A34A" : "#D97706" }]}>
        <View style={styles.liveDot} />
        <Text style={styles.liveTxt}>
          {connected ? "📷 DIRECT LIVE" : "📷 CONNECTING…"}
        </Text>
      </View>

      {/* Error overlay */}
      {error && (
        <View style={styles.errorOverlay}>
          <Ionicons name="wifi-outline" size={28} color="#94a3b8" />
          <Text style={styles.offlineTxt}>Camera Offline</Text>
          <Text style={styles.errorHint}>Check camera IP and WiFi</Text>
        </View>
      )}
    </View>
  );
}

// ─── Device Card ──────────────────────────────────────────────────────────────
function DeviceCard({ device, onDelete, onToggle, onFullscreen }) {
  const isActive = device.status === "Active";
  const CARD_H   = 220;

  return (
    <View style={styles.card}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => onFullscreen(device)}>
        <View style={{ height: CARD_H }}>
          <DirectStreamView
            device={device}
            style={{ width: "100%", height: CARD_H }}
          />
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => onDelete(device.id)}
          >
            <Ionicons name="trash-outline" size={15} color="white" />
          </TouchableOpacity>
          <View style={styles.fsHint}>
            <Text style={styles.fsHintTxt}>⛶ Fullscreen</Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.infoRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.deviceName}>{device.name}</Text>
          <Text style={styles.deviceSub} numberOfLines={1}>
            {device.ip || "No IP set"}
          </Text>
        </View>
        <View style={styles.toggleRow}>
          <Text style={[styles.statusTxt,
            { color: isActive ? "#16A34A" : "#94a3b8" }]}>
            {isActive ? "Active" : "Off"}
          </Text>
          <Switch
            value={isActive}
            onValueChange={() => onToggle(device)}
            trackColor={{ false: "#e2e8f0", true: "#0891b2" }}
            thumbColor="#ffffff"
          />
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DevicesScreen() {
  const [devices,          setDevices]         = useState([]);
  const [modalVisible,     setModalVisible]    = useState(false);
  const [fullscreenDevice, setFullscreenDevice]= useState(null);
  const [newName,          setNewName]         = useState("");
  const [newIP,            setNewIP]           = useState("");
  const [saving,           setSaving]          = useState(false);

  const user = auth.currentUser;

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, "devices"),
      where("userId", "==", user.uid)
    );
    return onSnapshot(
      q,
      (snap) => setDevices(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err)  => {
        if (err.code === "permission-denied") {
          console.warn("[SecretEye] Firestore rules expired — republish rules.");
        }
      }
    );
  }, [user?.uid]);

  const addDevice = async () => {
    if (!newName.trim()) {
      Alert.alert("Name Required", "Please enter a camera name.");
      return;
    }
    if (!newIP.trim()) {
      Alert.alert("IP Required", "Please enter the camera IP or URL.");
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, "devices"), {
        userId:    user.uid,
        name:      newName.trim(),
        ip:        newIP.trim(),
        type:      "ip",
        status:    "Active",
        createdAt: serverTimestamp(),
      });
      setModalVisible(false);
      setNewName("");
      setNewIP("");
    } catch {
      Alert.alert("Error", "Could not add device. Check Firestore rules.");
    } finally {
      setSaving(false);
    }
  };

  const deleteDevice = (id) => {
    Alert.alert("Remove Camera", "Delete this camera?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive",
        onPress: () => deleteDoc(doc(db, "devices", id)) },
    ]);
  };

  const toggleStatus = async (device) => {
    try {
      await updateDoc(doc(db, "devices", device.id), {
        status: device.status === "Active" ? "Inactive" : "Active",
      });
    } catch {
      Alert.alert("Error", "Could not update camera status.");
    }
  };

  return (
    <LinearGradient colors={["#F0F9FF", "#E0F2FE", "#FFFFFF"]} style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingTop: 64 }}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>NODES</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
            <Ionicons name="add" size={24} color="white" />
          </TouchableOpacity>
        </View>

        {/* Device list */}
        <FlatList
          data={devices}
          keyExtractor={d => d.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          renderItem={({ item }) => (
            <DeviceCard
              device={item}
              onDelete={deleteDevice}
              onToggle={toggleStatus}
              onFullscreen={setFullscreenDevice}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="videocam-off-outline" size={40} color="#CBD5E1" />
              <Text style={styles.emptyTxt}>No cameras added yet</Text>
              <Text style={styles.emptySubTxt}>
                Tap + to add your IP camera or IP Webcam URL
              </Text>
            </View>
          }
        />

        {/* Fullscreen Modal */}
        <Modal
          visible={!!fullscreenDevice}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setFullscreenDevice(null)}
        >
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            {fullscreenDevice && (
              <>
                <DirectStreamView
                  device={fullscreenDevice}
                  style={{ flex: 1 }}
                />
                <View style={styles.fsTopBar}>
                  <View style={{ flexDirection:"row", alignItems:"center", gap:8, flex:1 }}>
                    <View style={[styles.fsDot, {
                      backgroundColor: fullscreenDevice.status === "Active"
                        ? "#22c55e" : "#ef4444"
                    }]} />
                    <Text style={styles.fsName}>{fullscreenDevice.name}</Text>
                    <Text style={styles.fsType} numberOfLines={1}>
                      {fullscreenDevice.ip}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.fsCloseBtn}
                    onPress={() => setFullscreenDevice(null)}
                  >
                    <Ionicons name="close" size={20} color="white" />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </Modal>

        {/* Add Device Modal — KeyboardAvoidingView prevents keyboard covering input */}
        <Modal
          animationType="slide"
          transparent
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={20}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => setModalVisible(false)}
            />
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Add IP Camera</Text>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.inputLabel}>Camera Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Front Door, Living Room"
                  value={newName}
                  onChangeText={setNewName}
                  returnKeyType="next"
                />

                <Text style={styles.inputLabel}>Camera IP or URL</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 192.168.1.88:8080"
                  value={newIP}
                  onChangeText={setNewIP}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="done"
                  onSubmitEditing={addDevice}
                />

                {/* URL format hints */}
                <View style={styles.hintBox}>
                  <Text style={styles.hintTitle}>📱 IP Webcam app (Android):</Text>
                  <Text style={styles.hintLine}>192.168.1.88:8080</Text>
                  <Text style={[styles.hintTitle, { marginTop: 8 }]}>📷 Hikvision / Tapo (via Flask):</Text>
                  <Text style={styles.hintLine}>rtsp://admin:PASS@IP:554/Streaming/Channels/101</Text>
                  <Text style={[styles.hintTitle, { marginTop: 8 }]}>ℹ️  Note:</Text>
                  <Text style={styles.hintLine}>
                    HTTP cameras stream directly on the app.{"\n"}
                    RTSP cameras show in browser via Flask monitor.
                  </Text>
                </View>

                <View style={styles.modalBtnRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => { setModalVisible(false); setNewName(""); setNewIP(""); }}
                  >
                    <Text style={styles.cancelBtnTxt}>CANCEL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                    onPress={addDevice}
                    disabled={saving}
                  >
                    <Text style={styles.saveBtnTxt}>
                      {saving ? "SAVING…" : "ADD CAMERA"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

      </View>

      <View style={styles.footer}>
        <HomeFooter active="Devices" role="homeowner" />
      </View>
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header:        { flexDirection:"row", justifyContent:"space-between",
                   alignItems:"center", paddingHorizontal:16, marginBottom:8 },
  headerTitle:   { fontSize:28, fontWeight:"900", color:"#0C4A6E", letterSpacing:-1 },
  addBtn:        { backgroundColor:"#0891B2", padding:12, borderRadius:16, elevation:4 },

  infoBanner:    { flexDirection:"row", alignItems:"flex-start", backgroundColor:"#F0FDF4",
                   marginHorizontal:16, marginBottom:12, padding:10, borderRadius:12,
                   borderWidth:1, borderColor:"#86EFAC", gap:6 },
  infoBannerTxt: { color:"#16A34A", fontSize:11, flex:1, lineHeight:16 },

  card:          { backgroundColor:"#fff", borderRadius:24, marginBottom:16,
                   overflow:"hidden", elevation:4, borderWidth:1, borderColor:"#e0f2fe" },

  liveBadge:     { position:"absolute", top:10, left:10, flexDirection:"row",
                   alignItems:"center", paddingHorizontal:10, paddingVertical:4,
                   borderRadius:20 },
  liveDot:       { width:6, height:6, borderRadius:3, backgroundColor:"#fff", marginRight:5 },
  liveTxt:       { color:"#fff", fontSize:10, fontWeight:"900", textTransform:"uppercase" },

  errorOverlay:  { ...StyleSheet.absoluteFillObject, backgroundColor:"rgba(15,23,42,0.85)",
                   alignItems:"center", justifyContent:"center" },
  errorHint:     { color:"#64748B", fontSize:11, marginTop:6 },

  rtspHint:      { color:"#7C3AED", fontSize:11, textAlign:"center",
                   marginTop:8, lineHeight:18, paddingHorizontal:20 },

  deleteBtn:     { position:"absolute", top:10, right:10,
                   backgroundColor:"rgba(0,0,0,0.45)", padding:8, borderRadius:20 },
  fsHint:        { position:"absolute", bottom:6, right:8,
                   backgroundColor:"rgba(0,0,0,0.4)", paddingHorizontal:6,
                   paddingVertical:3, borderRadius:6 },
  fsHintTxt:     { color:"rgba(255,255,255,0.55)", fontSize:9 },

  infoRow:       { flexDirection:"row", alignItems:"center",
                   justifyContent:"space-between", padding:14 },
  deviceName:    { fontSize:15, fontWeight:"700", color:"#0C4A6E" },
  deviceSub:     { fontSize:11, color:"#94a3b8", marginTop:2,
                   fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  toggleRow:     { flexDirection:"row", alignItems:"center", gap:6 },
  statusTxt:     { fontSize:11, fontWeight:"700" },

  centred:       { alignItems:"center", justifyContent:"center" },
  offlineTxt:    { color:"#94a3b8", fontSize:11, fontWeight:"600",
                   textTransform:"uppercase", letterSpacing:1, marginTop:8 },

  emptyBox:      { alignItems:"center", padding:40, backgroundColor:"rgba(255,255,255,0.6)",
                   borderRadius:24, borderWidth:1, borderStyle:"dashed",
                   borderColor:"#BAE6FD", marginTop:20 },
  emptyTxt:      { color:"#94a3b8", marginTop:12, fontWeight:"600" },
  emptySubTxt:   { color:"#CBD5E1", fontSize:12, marginTop:4, textAlign:"center" },

  fsTopBar:      { position:"absolute", top:0, left:0, right:0, paddingTop:52,
                   paddingHorizontal:20, paddingBottom:14,
                   backgroundColor:"rgba(0,0,0,0.6)",
                   flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  fsDot:         { width:8, height:8, borderRadius:4 },
  fsName:        { color:"#fff", fontSize:15, fontWeight:"700" },
  fsType:        { color:"rgba(255,255,255,0.4)", fontSize:10, flex:1,
                   fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  fsCloseBtn:    { width:36, height:36, borderRadius:18,
                   backgroundColor:"rgba(255,255,255,0.15)",
                   alignItems:"center", justifyContent:"center" },

  modalSheet:    { backgroundColor:"#fff", borderTopLeftRadius:40,
                   borderTopRightRadius:40, padding:28, paddingBottom:40, elevation:20 },
  modalHandle:   { width:40, height:4, backgroundColor:"#e2e8f0",
                   borderRadius:2, alignSelf:"center", marginBottom:20 },
  modalTitle:    { fontSize:19, fontWeight:"900", color:"#0C4A6E",
                   marginBottom:20, textTransform:"uppercase" },

  inputLabel:    { fontSize:11, fontWeight:"700", color:"#64748B",
                   marginBottom:6, textTransform:"uppercase", letterSpacing:0.5 },
  input:         { backgroundColor:"#F8FAFC", padding:14, borderRadius:14,
                   marginBottom:16, borderWidth:1, borderColor:"#e2e8f0", fontSize:13 },

  hintBox:       { backgroundColor:"#F8FAFC", borderRadius:12, padding:14,
                   marginBottom:20, borderWidth:1, borderColor:"#E2E8F0" },
  hintTitle:     { fontSize:11, fontWeight:"700", color:"#475569", marginBottom:4 },
  hintLine:      { fontSize:10, color:"#94a3b8", marginBottom:2,
                   fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },

  modalBtnRow:   { flexDirection:"row", gap:12, marginBottom:8 },
  cancelBtn:     { flex:1, backgroundColor:"#F1F5F9", paddingVertical:15,
                   borderRadius:14, alignItems:"center" },
  cancelBtnTxt:  { color:"#94a3b8", fontWeight:"700", letterSpacing:1 },
  saveBtn:       { flex:1, backgroundColor:"#0891B2", paddingVertical:15,
                   borderRadius:14, alignItems:"center", elevation:3 },
  saveBtnTxt:    { color:"#fff", fontWeight:"700", letterSpacing:1 },

  footer:        { position:"absolute", bottom:0, left:0, right:0 },
});