import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { View, type ViewStyle } from "react-native";
import type { Camera } from "@/lib/types";
import { colors } from "@/theme/colors";
import { Badge, Text } from "./ui";

const POLL_MS = 400;

/**
 * Builds a still-image URL from what the user typed.
 * IP Webcam (Android) and most HTTP cameras serve /shot.jpg; RTSP can't be
 * shown directly in the app.
 */
export function snapshotUrl(ip?: string): string | null {
  if (!ip) return null;
  const v = ip.trim();
  if (v.startsWith("rtsp://")) return null;
  if (/\.(jpg|jpeg|png)(\?.*)?$/i.test(v)) return v;
  const base = (v.startsWith("http://") || v.startsWith("https://") ? v : `http://${v}`).replace(/\/$/, "");
  return `${base}/shot.jpg`;
}

type FeedState = "off" | "rtsp" | "connecting" | "live" | "offline";

/** Resolves true if the image downloaded within `ms`. */
function loadFrame(uri: string, ms: number): Promise<boolean> {
  return Promise.race([
    Image.prefetch(uri, "memory").catch(() => false),
    new Promise<boolean>((r) => setTimeout(() => r(false), ms)),
  ]);
}

/**
 * Live view by polling the camera's snapshot endpoint directly. Frames are
 * fetched one at a time (next request only after the previous finished), and
 * the last good frame stays on screen so there's no flicker.
 */
export function CameraFeed({ camera, style, showStatus = true }: { camera: Camera; style?: ViewStyle; showStatus?: boolean }) {
  const url = snapshotUrl(camera.ip);
  const active = camera.status === "Active";
  const [frame, setFrame] = useState<string | null>(null);
  const [state, setState] = useState<FeedState>("connecting");
  const errors = useRef(0);

  useEffect(() => {
    errors.current = 0;
    setFrame(null);
    if (!active) return setState("off");
    if (!url) return setState("rtsp");
    setState("connecting");
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const next = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
      const ok = await loadFrame(next, 5000);
      if (cancelled) return;
      if (ok) {
        errors.current = 0;
        setFrame(next);
        setState("live");
        timer = setTimeout(tick, POLL_MS);
      } else {
        errors.current += 1;
        if (errors.current >= 2) setState("offline");
        timer = setTimeout(tick, 3000); // back off while unreachable
      }
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, url]);

  const overlay = (icon: keyof typeof Ionicons.glyphMap, title: string, hint?: string) => (
    <View className="absolute inset-0 items-center justify-center bg-bg/80 px-6">
      <Ionicons name={icon} size={28} color={colors.muted} />
      <Text variant="label" tone="muted" className="mt-2 text-center">
        {title}
      </Text>
      {hint ? (
        <Text variant="caption" tone="subtle" className="mt-1 text-center">
          {hint}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={style} className="overflow-hidden bg-black">
      {frame && (state === "live" || state === "offline") ? (
        <Image source={{ uri: frame }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory" transition={0} />
      ) : null}
      {state === "off" && overlay("videocam-off-outline", "Camera turned off")}
      {state === "rtsp" && overlay("desktop-outline", "RTSP camera", "Live view isn't available in the app for RTSP cameras. AI monitoring still runs.")}
      {state === "connecting" && overlay("sync-outline", "Connecting…")}
      {state === "offline" && overlay("cloud-offline-outline", "Camera offline", "Check that the camera and phone are on the same Wi-Fi.")}
      {showStatus ? (
        <View className="absolute left-3 top-3">
          {state === "live" ? (
            <Badge label="Live" tone="ok" withDot />
          ) : state === "offline" ? (
            <Badge label="Offline" tone="danger" withDot />
          ) : state === "off" ? (
            <Badge label="Off" tone="neutral" withDot />
          ) : (
            <Badge label="Connecting" tone="warn" withDot />
          )}
        </View>
      ) : null}
    </View>
  );
}
