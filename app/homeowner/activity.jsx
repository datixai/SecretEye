import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { db } from '../../lib/firebase'; 
import { collection, query, where, orderBy, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import HomeFooter from '../../components/HomeFooter';
import { getAuth } from 'firebase/auth';

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
    const auth = getAuth();
    
    // CHANGED: use userId (uid) instead of email — matches Firestore detections schema
    const userId = auth.currentUser?.uid;

    useEffect(() => {
        if (!userId) {
            setDebugStatus('Error: No authenticated user');
            setLoading(false);
            return;
        }

        console.log('[Firestore] Searching for data matching userId:', userId);
        registerForPushNotificationsAsync();

        try {
            const detectionsRef = collection(db, "detections");
            const q = query(
                detectionsRef,
                where("userId", "==", userId),   // CHANGED: was where("userEmail", "==", searchEmail)
                orderBy("timestamp", "desc")
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                console.log(`[Firestore] Sync complete. Documents found: ${snapshot.docs.length}`);
                
                if (snapshot.empty) {
                    setDebugStatus(`No data found for user`);
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

                const items = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                setActivities(items);
                setLoading(false);
                handleAutoCleanup(items);
            }, (error) => {
                console.error("[Firestore] Listener error:", error.code, error.message);
                setDebugStatus(`Connection Error: ${error.code}`);
                setLoading(false);
            });

            return () => unsubscribe();
        } catch (err) {
            console.error("[Firestore] Query Construction Error:", err);
            setDebugStatus('Query Configuration Error');
        }
    }, [userId]);  // CHANGED: was [userEmail, searchEmail]

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
        Alert.alert(
            "Clear History",
            "Delete all activity logs permanently?",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Delete All", style: "destructive", onPress: clearAllLogs }
            ]
        );
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
                    </View>
                ) : (
                    activities.map((item) => (
                        <View key={item.id} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 mb-4">
                            <View className="flex-row justify-between items-start">
                                <View className="flex-1">
                                    <View className="flex-row items-center mb-1">
                                        <View className={`h-2.5 w-2.5 rounded-full mr-2 ${
                                            item.type === 'WEAPON' ? 'bg-red-500' : 
                                            item.type === 'STRANGER' ? 'bg-amber-400' : 'bg-green-500'
                                        }`} />
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