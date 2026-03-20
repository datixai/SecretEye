import React, { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, Image, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { db, auth } from "../../lib/firebase";
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc } from "firebase/firestore";
import HomeFooter from "../../components/HomeFooter";
import { Video, ResizeMode } from 'expo-av';

// Your PC's IP where the AI Hub (app.py) is running
const SERVER = "http://192.168.1.162:5000";

export default function DevicesScreen() {
  const cameraRef = useRef(null);
  const timerRef = useRef(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [modalVisible, setModalVisible] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [scannerMode, setScannerMode] = useState(false);
  const [devices, setDevices] = useState([]);

  // NEW: fullscreen modal state
  const [fullscreenDevice, setFullscreenDevice] = useState(null);

  const [facing, setFacing] = useState("back");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const [uploadStatus, setUploadStatus] = useState("idle"); 
  const [lastVideoUri, setLastVideoUri] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [newName, setNewName] = useState("");
  const [newIP, setNewIP] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "devices"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDevices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const deleteDevice = (id) => {
    Alert.alert("Remove Node", "Are you sure you want to delete this camera?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => await deleteDoc(doc(db, "devices", id)) }
    ]);
  };

  // NEW: toggle Active/Inactive — writes to Firestore devices/{id}.status
  const toggleDeviceStatus = async (device) => {
    const newStatus = device.status === "Active" ? "Inactive" : "Active";
    try {
      await updateDoc(doc(db, "devices", device.id), { status: newStatus });
    } catch (e) {
      Alert.alert("Error", "Could not update camera status.");
    }
  };

  const handleBarCodeScanned = async ({ data }) => {
    setScannerMode(false);
    await addDoc(collection(db, "devices"), {
      userId: user.uid,
      name: "QR Node",
      ip: data,
      status: "Active",
      createdAt: serverTimestamp(),
    });
    Alert.alert("Success", "External Node Added ✅");
  };

  const addDeviceManual = async () => {
    if (!newName || !newIP) return;
    await addDoc(collection(db, "devices"), {
      userId: user.uid,
      name: newName,
      ip: newIP,
      status: "Active",
      createdAt: serverTimestamp(),
    });
    setModalVisible(false);
    setNewName("");
    setNewIP("");
  };

  const uploadVideo = async (uri) => {
    setUploadStatus("uploading");
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.append("video", {
        uri: uri,
        name: `mobile_vid_${Date.now()}.mp4`,
        type: "video/mp4",
      });
      formData.append("userEmail", user?.email || "unknown");

      const response = await fetch(`${SERVER}/upload-video`, {
        method: "POST",
        body: formData,
        headers: { 'Accept': 'application/json' },
      });

      if (response.ok) {
        setUploadStatus("success");
        setTimeout(() => setUploadStatus("idle"), 3000);
      } else {
        throw new Error(`Server Error (${response.status})`);
      }
    } catch (error) {
      setUploadStatus("error");
      setErrorMessage(error.message.includes("Network request failed") ? "PC Server Offline" : error.message);
    }
  };

  const handleVideo = async () => {
    if (!cameraRef.current) return;
    if (isRecording) {
      cameraRef.current.stopRecording();
      setIsRecording(false);
      clearInterval(timerRef.current);
      return;
    }
    try {
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
      const video = await cameraRef.current.recordAsync({ quality: "720p" });
      if (video?.uri) {
        setLastVideoUri(video.uri);
        uploadVideo(video.uri);
      }
    } catch (error) {
      setIsRecording(false);
      clearInterval(timerRef.current);
      Alert.alert("Camera Error", "Check permissions.");
    }
  };

  if (showCamera || scannerMode) {
    return (
      <View style={{ flex: 1, backgroundColor: 'black' }}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing={facing}
          mode="video" 
          onBarcodeScanned={scannerMode ? handleBarCodeScanned : undefined}
        >
          {uploadStatus !== "idle" && (
            <View className="absolute top-16 left-6 right-6 z-50">
               <View className={`p-4 rounded-2xl flex-row items-center justify-between shadow-2xl ${
                 uploadStatus === 'uploading' ? 'bg-cyan-600' : 
                 uploadStatus === 'success' ? 'bg-green-600' : 'bg-red-600'
               }`}>
                 <View className="flex-row items-center flex-1">
                   {uploadStatus === 'uploading' ? <ActivityIndicator color="white" size="small" className="mr-3" /> : <Ionicons name={uploadStatus === 'success' ? "checkmark-circle" : "warning"} size={24} color="white" className="mr-3" />}
                   <View>
                     <Text className="text-white font-bold capitalize">{uploadStatus}...</Text>
                     {uploadStatus === 'error' && <Text className="text-white/80 text-xs">{errorMessage}</Text>}
                   </View>
                 </View>
                 {uploadStatus === 'error' && (
                   <View className="flex-row gap-2">
                     <TouchableOpacity onPress={() => setUploadStatus("idle")} className="bg-white/20 p-2 rounded-lg"><Text className="text-white text-xs font-bold">CANCEL</Text></TouchableOpacity>
                     <TouchableOpacity onPress={() => uploadVideo(lastVideoUri)} className="bg-white p-2 rounded-lg"><Text className="text-red-600 text-xs font-bold">RETRY</Text></TouchableOpacity>
                   </View>
                 )}
               </View>
            </View>
          )}

          <View className="flex-1 justify-between p-6 pt-12">
            <View className="flex-row justify-between">
              <TouchableOpacity onPress={() => { clearInterval(timerRef.current); setIsRecording(false); setShowCamera(false); setScannerMode(false); }} className="bg-black/40 p-3 rounded-full">
                <Ionicons name="close" size={28} color="white" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')} className="bg-black/40 p-3 rounded-full">
                <Ionicons name="camera-reverse-outline" size={28} color="white" />
              </TouchableOpacity>
            </View>
            {!scannerMode && (
              <View className="items-center mb-10">
                {isRecording && <View className="bg-red-600 px-4 py-1 rounded-full mb-6"><Text className="text-white font-mono font-bold">{formatTime(recordingTime)}</Text></View>}
                <TouchableOpacity onPress={handleVideo} disabled={uploadStatus === 'uploading'} className={`w-20 h-20 rounded-full items-center justify-center border-4 border-white ${isRecording ? 'bg-transparent' : 'bg-red-600'}`}>
                  <Ionicons name={isRecording ? "stop" : "videocam"} size={36} color="white" />
                </TouchableOpacity>
                <Text className="text-white font-bold mt-4 bg-black/50 px-4 py-1 rounded-lg uppercase text-xs tracking-widest">{isRecording ? "Recording..." : "Ready"}</Text>
              </View>
            )}
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <LinearGradient colors={["#F0F9FF", "#E0F2FE", "#FFFFFF"]} style={{ flex: 1 }}>
      <View className="flex-1 px-6 pt-16">
        <View className="flex-row justify-between items-center mb-8">
          <Text className="text-3xl font-black text-cyan-900 tracking-tighter uppercase">Nodes</Text>
          <View className="flex-row gap-3">
            <TouchableOpacity onPress={() => setRefreshKey(prev => prev + 1)} className="bg-white p-3 rounded-2xl shadow-sm border border-cyan-100">
              <Ionicons name="refresh" size={24} color="#0891B2" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(true)} className="bg-cyan-600 p-3 rounded-2xl shadow-xl">
              <Ionicons name="add" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

          {/* Mobile AI Node card REMOVED */}

          <Text className="text-cyan-900/40 font-bold mb-4 uppercase tracking-widest text-[10px]">External Streams (AI Hub)</Text>

          {devices.map(device => {
            const isRTSP = device.ip.startsWith('rtsp://');
            const isActive = device.status === "Active";
            const aiStreamUri = `${SERVER}/video_feed?userId=${device.userId}&device=${device.name}&t=${Date.now()}`;

            return (
              <View key={`${device.id}-${refreshKey}`} className="bg-white rounded-[32px] mb-6 overflow-hidden border border-cyan-50 shadow-md">

                {/* CHANGED: h-48 → h-64, wrapped in TouchableOpacity for fullscreen */}
                <TouchableOpacity activeOpacity={0.92} onPress={() => setFullscreenDevice(device)}>
                  <View className="h-64 bg-black relative">
                    {isRTSP ? (
                      <Video
                        source={{ uri: device.ip }}
                        rate={1.0}
                        volume={0}
                        isMuted={true}
                        resizeMode={ResizeMode.COVER}
                        shouldPlay={isActive}
                        isLooping
                        useNativeControls={false}
                        style={{ width: '100%', height: '100%' }}
                      />
                    ) : isActive ? (
                      <Image
                        key={`ai-stream-${device.id}-${refreshKey}`}
                        source={{ 
                          uri: aiStreamUri,
                          headers: { Pragma: 'no-cache' }
                        }} 
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View className="flex-1 items-center justify-center gap-2">
                        <Ionicons name="videocam-off-outline" size={40} color="#94a3b8" />
                        <Text className="text-slate-400 text-xs font-semibold uppercase tracking-widest">Camera Inactive</Text>
                      </View>
                    )}

                    {/* AI Processing badge — only when active */}
                    {isActive && (
                      <View className="absolute top-4 left-4 bg-red-600 px-3 py-1 rounded-full flex-row items-center z-10">
                        <View className="w-1.5 h-1.5 bg-white rounded-full mr-2" />
                        <Text className="text-white text-[10px] font-black uppercase tracking-tighter">
                          AI Processing
                        </Text>
                      </View>
                    )}

                    {/* Fullscreen hint */}
                    <View className="absolute bottom-3 right-3 bg-black/40 px-2 py-1 rounded-lg z-10">
                      <Text className="text-white/60 text-[9px] font-semibold uppercase tracking-wider">⛶ Fullscreen</Text>
                    </View>

                    <TouchableOpacity onPress={() => deleteDevice(device.id)} className="absolute top-4 right-4 bg-black/40 p-2 rounded-full z-10">
                      <Ionicons name="trash-outline" size={16} color="white" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>

                {/* CHANGED: replaced static "Live AI" badge with toggle switch */}
                <View className="p-5 flex-row justify-between items-center">
                  <View className="flex-1">
                    <Text className="font-bold text-cyan-900 text-lg">{device.name}</Text>
                    <Text className="text-xs text-gray-400 font-mono tracking-tighter" numberOfLines={1}>
                      AI Engine Source: {device.ip}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2 ml-3">
                    <Text className={`text-xs font-bold ${isActive ? 'text-green-600' : 'text-slate-400'}`}>
                      {isActive ? 'Active' : 'Inactive'}
                    </Text>
                    <Switch
                      value={isActive}
                      onValueChange={() => toggleDeviceStatus(device)}
                      trackColor={{ false: '#e2e8f0', true: '#0891b2' }}
                      thumbColor={isActive ? '#ffffff' : '#94a3b8'}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* NEW: Fullscreen single camera modal */}
        <Modal
          visible={!!fullscreenDevice}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setFullscreenDevice(null)}
        >
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {fullscreenDevice && (() => {
              const fsActive = fullscreenDevice.status === "Active";
              const fsRTSP = fullscreenDevice.ip.startsWith('rtsp://');
              const fsUri = `${SERVER}/video_feed?userId=${fullscreenDevice.userId}&device=${fullscreenDevice.name}&t=${Date.now()}`;
              return (
                <>
                  {fsRTSP ? (
                    <Video
                      source={{ uri: fullscreenDevice.ip }}
                      rate={1.0} volume={0} isMuted={true}
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={fsActive} isLooping
                      style={{ flex: 1 }}
                    />
                  ) : fsActive ? (
                    <Image
                      source={{ uri: fsUri, headers: { Pragma: 'no-cache' } }}
                      style={{ flex: 1 }}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                      <Ionicons name="videocam-off-outline" size={56} color="#475569" />
                      <Text style={{ color: '#475569', fontSize: 14, fontWeight: '600' }}>Camera Inactive</Text>
                    </View>
                  )}

                  {/* Fullscreen top bar */}
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 52, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: 'rgba(0,0,0,0.55)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fsActive ? '#22c55e' : '#ef4444' }} />
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{fullscreenDevice.name}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{fullscreenDevice.ip}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setFullscreenDevice(null)}
                      style={{ backgroundColor: 'rgba(255,255,255,0.15)', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="close" size={20} color="white" />
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </Modal>

        <Modal animationType="slide" transparent visible={modalVisible}>
          <View className="flex-1 justify-end bg-black/40">
            <View className="bg-white rounded-t-[40px] p-8 pb-12 shadow-2xl">
              <View className="w-10 h-1 bg-gray-200 rounded-full self-center mb-6" />
              <Text className="text-xl font-black text-cyan-900 mb-6 uppercase">New Node</Text>
              <TextInput className="bg-gray-50 p-5 rounded-2xl mb-4 border border-gray-100 font-semibold" placeholder="Device Name" value={newName} onChangeText={setNewName} />
              <TextInput 
                className="bg-gray-50 p-5 rounded-2xl mb-8 border border-gray-100 font-mono" 
                placeholder="IP (e.g. 192.168.1.50:8080)" 
                value={newIP} 
                onChangeText={setNewIP} 
                autoCapitalize="none"
              />
              <View className="flex-row gap-4">
                <TouchableOpacity onPress={() => setModalVisible(false)} className="flex-1 bg-gray-100 py-4 rounded-2xl items-center"><Text className="text-gray-400 font-bold tracking-widest">CANCEL</Text></TouchableOpacity>
                <TouchableOpacity onPress={addDeviceManual} className="flex-1 bg-cyan-600 py-4 rounded-2xl items-center shadow-lg"><Text className="text-white font-bold tracking-widest">SAVE</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
      <View className="absolute bottom-0 left-0 right-0">
        <HomeFooter active="Devices" role="homeowner" />
      </View>
    </LinearGradient>
  );
}