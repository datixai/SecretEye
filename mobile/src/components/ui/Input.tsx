import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { cn } from "@/lib/cn";
import { colors } from "@/theme/colors";
import { Text } from "./Text";

export const Input = forwardRef<
  TextInput,
  TextInputProps & {
    label?: string;
    error?: string;
    hint?: string;
    icon?: keyof typeof Ionicons.glyphMap;
    password?: boolean;
  }
>(function Input({ label, error, hint, icon, password, className, onFocus, onBlur, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  return (
    <View className="mb-4">
      {label ? (
        <Text variant="label" tone="muted" className="mb-2">
          {label}
        </Text>
      ) : null}
      <View
        className={cn(
          "h-[52px] flex-row items-center rounded-xl border bg-surface px-4",
          error ? "border-danger" : focused ? "border-accent" : "border-border",
          props.editable === false && "opacity-60",
        )}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.muted} style={{ marginRight: 10 }} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          secureTextEntry={password && hidden}
          className={cn("h-full flex-1 font-sans text-[15px] text-text", className)}
          style={{ outlineStyle: "none" } as object}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {password ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityLabel="Toggle password visibility">
            <Ionicons name={hidden ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" className="mt-1.5">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="subtle" className="mt-1.5">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
