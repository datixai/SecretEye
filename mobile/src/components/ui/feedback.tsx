import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";
import { colors } from "@/theme/colors";
import { Button } from "./Button";
import { Input } from "./Input";
import { Text } from "./Text";

// Toasts and dialogs are our own components so they look the same on every
// platform (React Native's Alert does nothing on web).

type ToastTone = "success" | "error" | "info" | "danger" | "warn";
interface Toast {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
  onPress?: () => void;
}

interface DialogOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  /** Ask for a password (e.g. re-authentication) and return it. */
  passwordPrompt?: boolean;
}

interface FeedbackState {
  toasts: Toast[];
  dialog: (DialogOptions & { resolve: (v: string | false) => void }) | null;
}

const useFeedback = create<FeedbackState>(() => ({ toasts: [], dialog: null }));

let nextId = 1;
export function toast(title: string, opts: { message?: string; tone?: ToastTone; onPress?: () => void } = {}) {
  const t: Toast = { id: nextId++, title, message: opts.message, tone: opts.tone ?? "info", onPress: opts.onPress };
  useFeedback.setState((s) => ({ toasts: [...s.toasts.slice(-2), t] }));
  setTimeout(() => useFeedback.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), 4000);
}

/** Resolves true/false (or the typed password when passwordPrompt is set). */
export function confirm(opts: DialogOptions): Promise<string | false> {
  return new Promise((resolve) => useFeedback.setState({ dialog: { ...opts, resolve } }));
}

const toneStyle: Record<ToastTone, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  success: { icon: "checkmark-circle", color: colors.ok },
  error: { icon: "close-circle", color: colors.danger },
  danger: { icon: "warning", color: colors.danger },
  warn: { icon: "alert-circle", color: colors.warn },
  info: { icon: "information-circle", color: colors.accent },
};

export function FeedbackHost() {
  const toasts = useFeedback((s) => s.toasts);
  const dialog = useFeedback((s) => s.dialog);
  const insets = useSafeAreaInsets();
  return (
    <>
      <View style={{ pointerEvents: "box-none", position: "absolute", top: insets.top + 8, left: 16, right: 16, gap: 8, alignItems: "center" }}>
        {toasts.map((t) => {
          const s = toneStyle[t.tone];
          return (
            <Animated.View key={t.id} entering={FadeInUp} exiting={FadeOutUp} style={{ width: "100%", maxWidth: 480 }}>
              <Pressable
                onPress={() => {
                  t.onPress?.();
                  useFeedback.setState((st) => ({ toasts: st.toasts.filter((x) => x.id !== t.id) }));
                }}
                className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface2 px-4 py-3"
                style={{ shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 }}
              >
                <Ionicons name={s.icon} size={22} color={s.color} />
                <View className="flex-1">
                  <Text variant="label" weight="semibold">
                    {t.title}
                  </Text>
                  {t.message ? <Text variant="caption">{t.message}</Text> : null}
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
      {dialog ? <Dialog key={dialog.title} {...dialog} /> : null}
    </>
  );
}

function Dialog({ title, message, confirmText = "Confirm", cancelText = "Cancel", destructive, passwordPrompt, resolve }: DialogOptions & { resolve: (v: string | false) => void }) {
  const [password, setPassword] = useState("");
  const done = useRef(false);
  const close = (v: string | false) => {
    if (done.current) return;
    done.current = true;
    useFeedback.setState({ dialog: null });
    resolve(v);
  };
  useEffect(() => () => close(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal transparent animationType="fade" onRequestClose={() => close(false)}>
      <Pressable className="flex-1 items-center justify-center bg-black/60 px-6" onPress={() => close(false)}>
        <Pressable className="w-full max-w-[400px] rounded-2xl border border-border bg-surface p-5" onPress={() => {}}>
          <Text variant="heading">{title}</Text>
          {message ? (
            <Text variant="body" tone="muted" className="mt-2">
              {message}
            </Text>
          ) : null}
          {passwordPrompt ? (
            <View className="mt-4">
              <Input password autoFocus placeholder="Current password" value={password} onChangeText={setPassword} />
            </View>
          ) : null}
          <View className="mt-5 flex-row gap-3">
            <View className="flex-1">
              <Button compact variant="secondary" title={cancelText} onPress={() => close(false)} />
            </View>
            <View className="flex-1">
              <Button
                compact
                variant={destructive ? "danger" : "primary"}
                title={confirmText}
                disabled={passwordPrompt && !password}
                onPress={() => close(passwordPrompt ? password : "ok")}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
