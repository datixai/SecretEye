/**
 * SecretEye — homeowner/devices.jsx  (On-Device AI Version)
 *
 * AI runs entirely on the phone — no Flask server needed for detection.
 * Face recognition still calls the Flask /verify-face endpoint (optional).
 *
 * Models used (in ml_models/ at project root):
 *   weapon.onnx  — classes: {0:'-', 1:'fight', 2:'weapons'}
 *   fight.onnx   — classes: {0:'non_violence', 1:'violence'}
 *
 * Requires:
 *   npm install react-native-fast-tflite react-native-vision-camera
 *   app.json plugins: ["react-native-vision-camera"]
 *   npx expo run:android   (Expo Go will NOT work)
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  useCallback, useEffect,
  useRef, useState
} from "react";
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Modal,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useTensorflowModel } from "react-native-fast-tflite";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor
} from "react-native-vision-camera";
import { useSharedValue, Worklets } from "react-native-worklets-core";
import HomeFooter from "../../components/HomeFooter";
import { auth, db } from "../../lib/firebase";

// ─── Config ──────────────────────────────────────────────────────────────────

// Flask server — only needed for face recognition.
// If you have no server running, set FACE_ENABLED = false below.
const SERVER       = "http://192.168.1.162:5000";
const FACE_ENABLED = false;   // ← set true when Flask /verify-face is running

// Detection thresholds
const WEAPON_CONF      = 0.55;   // slightly lower than backend (mobile models are less precise)
const VIOLENCE_CONF    = 0.50;
const CONFIRM_NEEDED   = 3;      // consecutive hits before alert fires
const COOLDOWN_MS      = 60000;  // 60s between same-type alerts

// Model input size (must match export imgsz — we used 320)
const MODEL_SIZE = 320;

// Classes
// weapon.onnx:  {0:'-', 1:'fight', 2:'weapons'}
// fight.onnx:   {0:'non_violence', 1:'violence'}
const WEAPON_CLASS_ID   = 2;   // 'weapons' in weapon.onnx
const FIGHT_CLASS_ID    = 1;   // 'fight'   in weapon.onnx (bonus)
const VIOLENCE_CLASS_ID = 1;   // 'violence' in fight.onnx

const { width: SW, height: SH } = Dimensions.get("window");

// ─── Helper — decode YOLO ONNX output ────────────────────────────────────────
// YOLOv8 with NMS baked in outputs shape [1, 300, 6]:
//   each row = [x1, y1, x2, y2, confidence, class_id]
//   all values are in 0-1 range (normalised to model input size)
function decodeYoloOutput(outputData, threshold) {
  const detections = [];
  // outputData is a Float32Array — 300 boxes × 6 values
  const numBoxes = Math.floor(outputData.length / 6);
  for (let i = 0; i < numBoxes; i++) {
    const offset = i * 6;
    const conf   = outputData[offset + 4];
    if (conf < threshold) continue;
    const classId = Math.round(outputData[offset + 5]);
    detections.push({
      x1:      outputData[offset],
      y1:      outputData[offset + 1],
      x2:      outputData[offset + 2],
      y2:      outputData[offset + 3],
      conf,
      classId,
    });
  }
  return detections;
}

// ─── BoxOverlay — draws bounding boxes on top of the camera preview ──────────
function BoxOverlay({ boxes, viewWidth, viewHeight }) {
  if (!boxes || boxes.length === 0) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {boxes.map((box, i) => {
        const left   = box.x1 * viewWidth;
        const top    = box.y1 * viewHeight;
        const width  = (box.x2 - box.x1) * viewWidth;
        const height = (box.y2 - box.y1) * viewHeight;
        const color  = box.type === "Weapon" ? "#EF4444"
                     : box.type === "Violence" ? "#F97316"
                     : "#22C55E";
        return (
          <View key={i} style={{
            position:    "absolute",
            left, top, width, height,
            borderWidth: 2,
            borderColor: color,
          }}>
            <View style={{
              backgroundColor: color,
              paddingHorizontal: 4, paddingVertical: 2,
              alignSelf: "flex-start",
            }}>
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "bold" }}>
                {box.type} {(box.conf * 100).toFixed(0)}%
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── CameraDetectionView ─────────────────────────────────────────────────────
// Handles the camera + on-device inference for ONE device.
// Separated from the list so the camera only runs when this card is visible.
function CameraDetectionView({ device: deviceDoc, containerStyle, onAlert }) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraDevice = useCameraDevice("back");

  // Load both ONNX models — paths relative to project root (ml_models/)
  // react-native-fast-tflite resolves these via Metro bundler
  const weaponModel   = useTensorflowModel(
    require("../../ml_models/weapon.onnx")
  );
  const fightModel    = useTensorflowModel(
    require("../../ml_models/fight.onnx")
  );

  // Shared values for cross-thread communication (JS ↔ worklet)
  const detectedBoxes  = useSharedValue([]);
  const frameCount     = useSharedValue(0);

  // Confirmation counters (worklet-safe plain objects stored in shared values)
  const weaponCount    = useSharedValue(0);
  const violenceCount  = useSharedValue(0);

  // Cooldown timestamps — stored in a ref (JS thread only)
  const lastAlertRef   = useRef({});

  // Callback from worklet → JS thread when a confirmed detection happens
  const onDetection = Worklets.createRunOnJS((type, conf, boxes) => {
    const now = Date.now();
    if (now - (lastAlertRef.current[type] || 0) < COOLDOWN_MS) return;
    lastAlertRef.current[type] = now;
    onAlert(type, conf, boxes);
  });

  // Request camera permission on mount
  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  // ── Frame processor — runs on the camera thread ────────────────────────────
  // This function is a "worklet" — it runs synchronously on a background thread
  // for every camera frame. It CANNOT use regular JS — only worklet-safe APIs.
  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";

    // Only run inference every 6th frame (~4fps on a 25fps stream)
    // This prevents overloading the phone CPU
    frameCount.value += 1;
    if (frameCount.value % 6 !== 0) return;

    // Models must be loaded before inference
    if (!weaponModel.model || !fightModel.model) return;

    const boxes = [];

    try {
      // ── Weapon model ────────────────────────────────────────────────────
      // Input: Float32Array [1, 3, 320, 320] (NCHW format)
      // The frame processor plugin handles resizing automatically
      const weaponOutput = weaponModel.model.runSync([frame]);
      const weaponData   = weaponOutput[0]; // Float32Array shape [1,300,6]

      const weaponDets = decodeYoloOutput(weaponData, WEAPON_CONF);
      let hasWeapon    = false;
      let hasFight     = false;

      for (const det of weaponDets) {
        if (det.classId === WEAPON_CLASS_ID) {
          hasWeapon = true;
          boxes.push({ ...det, type: "Weapon" });
        }
        if (det.classId === FIGHT_CLASS_ID) {
          hasFight = true;
        }
      }

      // ── Fight/violence model ────────────────────────────────────────────
      const fightOutput  = fightModel.model.runSync([frame]);
      const fightData    = fightOutput[0];
      const fightDets    = decodeYoloOutput(fightData, VIOLENCE_CONF);
      let hasViolence    = false;

      for (const det of fightDets) {
        if (det.classId === VIOLENCE_CLASS_ID) {
          hasViolence = true;
          boxes.push({ ...det, type: "Violence" });
        }
      }

      // ── Confirmation gates ──────────────────────────────────────────────
      // Weapon gate
      if (hasWeapon) {
        weaponCount.value += 1;
        if (weaponCount.value >= CONFIRM_NEEDED) {
          weaponCount.value = 0;
          const best = weaponDets.find(d => d.classId === WEAPON_CLASS_ID);
          onDetection("Weapon", best?.conf || WEAPON_CONF, boxes);
        }
      } else {
        weaponCount.value = 0;
      }

      // Violence gate
      if (hasViolence || hasFight) {
        violenceCount.value += 1;
        if (violenceCount.value >= CONFIRM_NEEDED) {
          violenceCount.value = 0;
          const best = fightDets.find(d => d.classId === VIOLENCE_CLASS_ID);
          onDetection("Violence", best?.conf || VIOLENCE_CONF, boxes);
        }
      } else {
        violenceCount.value = 0;
      }

      // Update overlay boxes
      detectedBoxes.value = boxes;

    } catch (e) {
      // Silently skip frames where inference fails (e.g. model still loading)
    }
  }, [weaponModel, fightModel]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!hasPermission) {
    return (
      <View style={[containerStyle, styles.centred]}>
        <Ionicons name="camera-off-outline" size={32} color="#94a3b8" />
        <Text style={styles.offlineText}>Camera permission needed</Text>
        <TouchableOpacity
          style={styles.permBtn}
          onPress={requestPermission}
        >
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!cameraDevice) {
    return (
      <View style={[containerStyle, styles.centred]}>
        <ActivityIndicator color="#0891B2" />
        <Text style={styles.offlineText}>Finding camera…</Text>
      </View>
    );
  }

  const modelsReady = weaponModel.state === "loaded" &&
                      fightModel.state  === "loaded";

  return (
    <View style={containerStyle}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={cameraDevice}
        isActive={deviceDoc.status === "Active"}
        frameProcessor={modelsReady ? frameProcessor : undefined}
        fps={25}
      />

      {/* AI bounding box overlay */}
      <BoxOverlay
        boxes={detectedBoxes.value}
        viewWidth={containerStyle.width   || SW}
        viewHeight={containerStyle.height || 240}
      />

      {/* Status badge */}
      {deviceDoc.status === "Active" && (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveTxt}>
            {modelsReady ? "AI Active" : "Loading AI…"}
          </Text>
        </View>
      )}

      {/* Model loading indicator */}
      {!modelsReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#22D3EE" size="small" />
          <Text style={styles.loadingTxt}>Loading AI models…</Text>
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function DevicesScreen() {
  const [devices,          setDevices]         = useState([]);
  const [modalVisible,     setModalVisible]    = useState(false);
  const [fullscreenDevice, setFullscreenDevice]= useState(null);
  const [newName,          setNewName]         = useState("");
  const [newIP,            setNewIP]           = useState("");
  const [alertLog,         setAlertLog]        = useState([]);

  const user = auth.currentUser;

  // ── Load devices from Firestore ───────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "devices"),
      where("userId", "==", user.uid)
    );
    return onSnapshot(q, snap =>
      setDevices(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [user]);

  // ── Handle a confirmed detection from the frame processor ────────────────
  const handleAlert = useCallback(async (deviceName, type, conf) => {
    console.log(`[SecretEye] ALERT: ${type} on ${deviceName} (${(conf*100).toFixed(0)}%)`);

    // Add to local log for in-screen display
    setAlertLog(prev => [
      { type, deviceName, conf, time: new Date().toLocaleTimeString(), id: Date.now() },
      ...prev.slice(0, 9),   // keep last 10
    ]);

    // Write to Firestore — same schema as Flask backend
    try {
      await addDoc(collection(db, "detections"), {
        userId:     user.uid,
        deviceName,
        type,
        priority:   "High",
        imageUrl:   "",        // no screenshot in on-device mode (future: use frame.toBase64())
        timestamp:  serverTimestamp(),
        status:     "new",
      });
    } catch (e) {
      console.error("[SecretEye] Firestore write failed:", e);
    }
  }, [user]);

  // ── Device CRUD ───────────────────────────────────────────────────────────
  const addDevice = async () => {
    if (!newName.trim() || !newIP.trim()) return;
    await addDoc(collection(db, "devices"), {
      userId:    user.uid,
      name:      newName.trim(),
      ip:        newIP.trim(),
      status:    "Active",
      createdAt: serverTimestamp(),
    });
    setModalVisible(false);
    setNewName("");
    setNewIP("");
  };

  const deleteDevice = (id) => {
    Alert.alert("Remove Camera", "Delete this camera node?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive",
        onPress: () => deleteDoc(doc(db, "devices", id)) },
    ]);
  };

  const toggleStatus = async (device) => {
    await updateDoc(doc(db, "devices", device.id), {
      status: device.status === "Active" ? "Inactive" : "Active",
    });
  };

  // ── Render a single device card ───────────────────────────────────────────
  const renderDevice = ({ item: device }) => {
    const isActive = device.status === "Active";

    return (
      <View style={styles.card}>

        {/* Camera view */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setFullscreenDevice(device)}
        >
          <CameraDetectionView
            device={device}
            containerStyle={{ width: "100%", height: 240,
                              backgroundColor: "#0f172a" }}
            onAlert={(type, conf) => handleAlert(device.name, type, conf)}
          />

          {/* Delete button */}
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => deleteDevice(device.id)}
          >
            <Ionicons name="trash-outline" size={16} color="white" />
          </TouchableOpacity>

          {/* Fullscreen hint */}
          <View style={styles.fullscreenHint}>
            <Text style={styles.fullscreenHintTxt}>⛶ Fullscreen</Text>
          </View>
        </TouchableOpacity>

        {/* Device info row */}
        <View style={styles.infoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.deviceName}>{device.name}</Text>
            <Text style={styles.deviceIp} numberOfLines={1}>{device.ip || "Phone Camera"}</Text>
          </View>
          <View style={styles.toggleRow}>
            <Text style={[styles.statusTxt,
              { color: isActive ? "#16A34A" : "#94a3b8" }]}>
              {isActive ? "Active" : "Inactive"}
            </Text>
            <Switch
              value={isActive}
              onValueChange={() => toggleStatus(device)}
              trackColor={{ false: "#e2e8f0", true: "#0891b2" }}
              thumbColor="#ffffff"
            />
          </View>
        </View>
      </View>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <LinearGradient colors={["#F0F9FF", "#E0F2FE", "#FFFFFF"]} style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingTop: 64 }}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>NODES</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={24} color="white" />
          </TouchableOpacity>
        </View>

        {/* Live alert ticker */}
        {alertLog.length > 0 && (
          <View style={styles.alertTicker}>
            <Ionicons name="warning" size={14} color="#EF4444" />
            <Text style={styles.alertTickerTxt} numberOfLines={1}>
              {alertLog[0].type} detected on {alertLog[0].deviceName} at {alertLog[0].time}
            </Text>
          </View>
        )}

        {/* Device list */}
        <FlatList
          data={devices}
          keyExtractor={d => d.id}
          renderItem={renderDevice}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="videocam-off-outline" size={40} color="#CBD5E1" />
              <Text style={styles.emptyTxt}>No camera nodes added yet.</Text>
              <Text style={styles.emptySubTxt}>Tap + to add your first camera.</Text>
            </View>
          }
        />

        {/* Fullscreen modal */}
        <Modal
          visible={!!fullscreenDevice}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setFullscreenDevice(null)}
        >
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            {fullscreenDevice && (
              <>
                <CameraDetectionView
                  device={fullscreenDevice}
                  containerStyle={{ flex: 1 }}
                  onAlert={(type, conf) =>
                    handleAlert(fullscreenDevice.name, type, conf)}
                />
                {/* Top bar */}
                <View style={styles.fsTopBar}>
                  <View style={styles.fsDeviceInfo}>
                    <View style={[styles.fsDot, {
                      backgroundColor: fullscreenDevice.status === "Active"
                        ? "#22c55e" : "#ef4444"
                    }]} />
                    <Text style={styles.fsDeviceName}>
                      {fullscreenDevice.name}
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

        {/* Add device modal */}
        <Modal animationType="slide" transparent visible={modalVisible}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>New Camera Node</Text>

              <TextInput
                style={styles.input}
                placeholder="Device Name  (e.g. Front Door)"
                value={newName}
                onChangeText={setNewName}
              />
              <TextInput
                style={styles.input}
                placeholder="IP or RTSP URL  (optional — phone camera if blank)"
                value={newIP}
                onChangeText={setNewIP}
                autoCapitalize="none"
              />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelBtnTxt}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={addDevice}
                >
                  <Text style={styles.saveBtnTxt}>SAVE</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <HomeFooter active="Devices" role="homeowner" />
      </View>
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Header
  header:         { flexDirection:"row", justifyContent:"space-between",
                    alignItems:"center", paddingHorizontal:16, marginBottom:8 },
  headerTitle:    { fontSize:28, fontWeight:"900", color:"#0C4A6E",
                    letterSpacing:-1 },
  addBtn:         { backgroundColor:"#0891B2", padding:12,
                    borderRadius:16, elevation:4 },

  // Alert ticker
  alertTicker:    { flexDirection:"row", alignItems:"center",
                    backgroundColor:"#FEF2F2", marginHorizontal:16,
                    marginBottom:8, padding:8, borderRadius:12,
                    borderWidth:1, borderColor:"#FECACA" },
  alertTickerTxt: { color:"#EF4444", fontSize:12, fontWeight:"700",
                    marginLeft:6, flex:1 },

  // Card
  card:           { backgroundColor:"#fff", borderRadius:24,
                    marginBottom:16, overflow:"hidden",
                    elevation:4, borderWidth:1, borderColor:"#e0f2fe" },

  // Camera overlay elements
  liveBadge:      { position:"absolute", top:12, left:12,
                    backgroundColor:"#DC2626", flexDirection:"row",
                    alignItems:"center", paddingHorizontal:10,
                    paddingVertical:4, borderRadius:20 },
  liveDot:        { width:6, height:6, borderRadius:3,
                    backgroundColor:"#fff", marginRight:6 },
  liveTxt:        { color:"#fff", fontSize:10, fontWeight:"900",
                    textTransform:"uppercase" },
  loadingOverlay: { position:"absolute", bottom:10, left:0, right:0,
                    flexDirection:"row", alignItems:"center",
                    justifyContent:"center", gap:6 },
  loadingTxt:     { color:"rgba(255,255,255,0.7)", fontSize:11 },
  deleteBtn:      { position:"absolute", top:12, right:12,
                    backgroundColor:"rgba(0,0,0,0.4)", padding:8,
                    borderRadius:20 },
  fullscreenHint: { position:"absolute", bottom:8, right:8,
                    backgroundColor:"rgba(0,0,0,0.4)", paddingHorizontal:8,
                    paddingVertical:4, borderRadius:8 },
  fullscreenHintTxt:{ color:"rgba(255,255,255,0.6)", fontSize:9 },

  // Info row
  infoRow:        { flexDirection:"row", alignItems:"center",
                    justifyContent:"space-between", padding:16 },
  deviceName:     { fontSize:16, fontWeight:"700", color:"#0C4A6E" },
  deviceIp:       { fontSize:11, color:"#94a3b8", fontFamily:"monospace" },
  toggleRow:      { flexDirection:"row", alignItems:"center", gap:8 },
  statusTxt:      { fontSize:12, fontWeight:"700" },

  // Empty state
  emptyBox:       { alignItems:"center", padding:40, backgroundColor:"rgba(255,255,255,0.6)",
                    borderRadius:24, borderWidth:1, borderStyle:"dashed",
                    borderColor:"#BAE6FD", marginTop:20 },
  emptyTxt:       { color:"#94a3b8", marginTop:12, fontWeight:"600" },
  emptySubTxt:    { color:"#CBD5E1", fontSize:12, marginTop:4 },

  // Offline / permission state
  centred:        { alignItems:"center", justifyContent:"center" },
  offlineText:    { color:"#94a3b8", fontSize:12, fontWeight:"600",
                    textTransform:"uppercase", letterSpacing:1, marginTop:8 },
  permBtn:        { marginTop:12, backgroundColor:"#0891B2",
                    paddingHorizontal:16, paddingVertical:8, borderRadius:12 },
  permBtnTxt:     { color:"#fff", fontWeight:"700", fontSize:13 },
  permBtnText:    { color:"#fff", fontWeight:"700", fontSize:13 },

  // Fullscreen
  fsTopBar:       { position:"absolute", top:0, left:0, right:0,
                    paddingTop:52, paddingHorizontal:20, paddingBottom:16,
                    backgroundColor:"rgba(0,0,0,0.55)",
                    flexDirection:"row", alignItems:"center",
                    justifyContent:"space-between" },
  fsDeviceInfo:   { flexDirection:"row", alignItems:"center", gap:8, flex:1 },
  fsDot:          { width:8, height:8, borderRadius:4 },
  fsDeviceName:   { color:"#fff", fontSize:16, fontWeight:"700" },
  fsCloseBtn:     { width:36, height:36, borderRadius:18,
                    backgroundColor:"rgba(255,255,255,0.15)",
                    alignItems:"center", justifyContent:"center" },

  // Add device modal
  modalOverlay:   { flex:1, justifyContent:"flex-end",
                    backgroundColor:"rgba(0,0,0,0.4)" },
  modalSheet:     { backgroundColor:"#fff", borderTopLeftRadius:40,
                    borderTopRightRadius:40, padding:32, paddingBottom:48,
                    elevation:20 },
  modalHandle:    { width:40, height:4, backgroundColor:"#e2e8f0",
                    borderRadius:2, alignSelf:"center", marginBottom:24 },
  modalTitle:     { fontSize:20, fontWeight:"900", color:"#0C4A6E",
                    marginBottom:24, textTransform:"uppercase" },
  input:          { backgroundColor:"#F8FAFC", padding:16, borderRadius:16,
                    marginBottom:16, borderWidth:1, borderColor:"#e2e8f0",
                    fontSize:14 },
  modalBtnRow:    { flexDirection:"row", gap:16 },
  cancelBtn:      { flex:1, backgroundColor:"#F1F5F9", paddingVertical:16,
                    borderRadius:16, alignItems:"center" },
  cancelBtnTxt:   { color:"#94a3b8", fontWeight:"700", letterSpacing:2 },
  saveBtn:        { flex:1, backgroundColor:"#0891B2", paddingVertical:16,
                    borderRadius:16, alignItems:"center", elevation:4 },
  saveBtnTxt:     { color:"#fff", fontWeight:"700", letterSpacing:2 },

  // Footer
  footer:         { position:"absolute", bottom:0, left:0, right:0 },
});