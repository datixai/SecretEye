import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../../lib/firebase';
// FIX: removed orderBy from import — not needed after switching to client-side sort
import { collection, doc, onSnapshot, query, where, writeBatch } from 'firebase/firestore';
import HomeFooter from '../../components/HomeFooter';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function ActivityScreen() {
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [debugStatus, setDebugStatus] = useState('Initializing...');

  // FIX: use shared auth from lib/firebase — not getAuth() locally
  const userId = auth.currentUser?.uid;

  useEffect(() => {
    if (!userId) {
      setDebugStatus('Error: No authenticated user');
      setLoading(false);
      return;
    }

    registerForPushNotificationsAsync();

    // FIX: removed orderBy("timestamp", "desc") — Firestore requires a composite
    // index for where() + orderBy() on different fields. Without the index the
    // query throws FAILED_PRECONDITION and returns nothing. Sorting client-side
    // instead — works instantly with no index required.
    const q = query(
      collection(db, "detections"),
      where("userId", "==", userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setDebugStatus('No activity found');
      } else {
        setDebugStatus('Live connection active');
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const newEntry = change.doc.data();
          const isFresh = newEntry.timestamp &&
            (Date.now() - newEntry.timestamp.toMillis() < 30000);
          if (isFresh && newEntry.type?.toUpperCase() !== "HOMEOWNER") {
            triggerLocalNotification(newEntry);
          }
        }
      });

      // Client-side sort by timestamp descending
      const items = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.timestamp?.toMillis?.() || 0;
          const tb = b.timestamp?.toMillis?.() || 0;
          return tb - ta;
        });

      setActivities(items);
      setLoading(false);
      handleAutoCleanup(items);
    }, (error) => {
      console.error("[Firestore] Listener error:", error.code, error.message);
      setDebugStatus(`Connection Error: ${error.code}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  async function registerForPushNotificationsAsync() {
    if (!Device.isDevice) return;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }
  }

  const triggerLocalNotification = async (data) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${data.type?.toUpperCase()} DETECTED`,
        body: `Event at ${data.deviceName || 'Primary Camera'}`,
        data: { data },
      },
      trigger: null,
    });
  };

  const handleAutoCleanup = async (items) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const batch = writeBatch(db);
    let hasDeletions = false;
    items.forEach((item) => {
      if (item.timestamp && item.timestamp.toDate() < sevenDaysAgo) {
        batch.delete(doc(db, "detections", item.id));
        hasDeletions = true;
      }
    });
    if (hasDeletions) await batch.commit();
  };

  const confirmClearAll = () => {
    if (activities.length === 0) return;
    Alert.alert("Clear History", "Delete all activity logs permanently?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete All", style: "destructive", onPress: clearAllLogs }
    ]);
  };

  const clearAllLogs = async () => {
    const batch = writeBatch(db);
    activities.forEach((item) => {
      batch.delete(doc(db, "detections", item.id));
    });
    await batch.commit();
  };

  const getAlertStyle = (type) => {
    const t = type?.toUpperCase();
    if (t === 'WEAPON') return 'text-red-600';
    if (t === 'STRANGER') return 'text-amber-500';
    return 'text-green-600';
  };

  const getDotColor = (type) => {
    const t = type?.toUpperCase();
    if (t === 'WEAPON') return 'bg-red-500';
    if (t === 'STRANGER') return 'bg-amber-400';
    return 'bg-green-500';
  };

  return (
    <View className="flex-1 bg-slate-50">
      <View className="px-6 pt-16 pb-6 bg-white shadow-sm flex-row justify-between items-end">
        <View className="flex-1 mr-4">
          <Text className="text-3xl font-bold text-slate-900">Activity Log</Text>
          <Text className="text-slate-500 text-xs" numberOfLines={1}>{debugStatus}</Text>
        </View>
        {activities.length > 0 && (
          <TouchableOpacity onPress={confirmClearAll}>
            <Text className="text-red-500 font-bold mb-1">Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        className="px-6 pt-4"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View className="mt-20 items-center">
            <ActivityIndicator size="large" color="#0ea5e9" />
            <Text className="text-slate-400 mt-4 font-medium">Synchronizing...</Text>
          </View>
        ) : activities.length === 0 ? (
          <View className="items-center mt-20 p-10 bg-white rounded-3xl border border-slate-100 border-dashed">
            <Text className="text-slate-400 text-center font-medium">No activity history found.</Text>
            <Text className="text-slate-300 text-center text-xs mt-2">AI detections will appear here in real-time</Text>
          </View>
        ) : (
          activities.map((item) => (
            <View key={item.id} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 mb-4">
              <View className="flex-row justify-between items-start">
                <View className="flex-1">
                  <View className="flex-row items-center mb-1">
                    <View className={`h-2.5 w-2.5 rounded-full mr-2 ${getDotColor(item.type)}`} />
                    <Text className={`font-bold text-lg ${getAlertStyle(item.type)}`}>
                      {item.type?.toUpperCase()}
                    </Text>
                  </View>
                  <Text className="text-slate-600 font-medium ml-4">
                    {item.deviceName || 'System Camera'}
                  </Text>
                </View>

                <View className="items-end">
                  <Text className="text-slate-900 font-bold">
                    {item.timestamp ? item.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                  </Text>
                  <Text className="text-slate-400 text-xs font-medium">
                    {item.timestamp ? item.timestamp.toDate().toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                  </Text>
                </View>
              </View>

              <View className="mt-4 flex-row justify-between items-center bg-slate-50 p-3 rounded-2xl">
                <View className="bg-white px-3 py-1 rounded-full border border-slate-100">
                  <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    Priority: {item.priority || 'Standard'}
                  </Text>
                </View>
                <TouchableOpacity>
                  <Text className="text-cyan-600 text-xs font-bold uppercase tracking-tighter">View Details</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0">
        <HomeFooter active="Activity" role="homeowner" />
      </View>
    </View>
  );
}