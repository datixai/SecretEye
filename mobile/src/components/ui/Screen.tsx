import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cn } from "@/lib/cn";
import { colors } from "@/theme/colors";

/**
 * Page shell used by every screen:
 *   header  — fixed at the top (use <Header />)
 *   body    — scrolls
 *   footer  — pinned to the bottom; the screen's primary action always lives here
 */
export function Screen({
  header,
  footer,
  children,
  scroll = true,
  padded = true,
  refreshing,
  onRefresh,
  edges = ["top"],
  contentClassName,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: ("top" | "bottom")[];
  contentClassName?: string;
}) {
  const body = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerClassName={cn(padded && "px-5", "pb-8 pt-2", contentClassName)}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View className={cn("flex-1", padded && "px-5", contentClassName)}>{children}</View>
  );

  return (
    <SafeAreaView edges={footer ? [...edges, "bottom"] : edges} className="flex-1 bg-bg">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* On tablets / wide web windows keep a comfortable reading column. */}
        <View className="w-full max-w-[640px] flex-1 self-center">
          {header}
          {body}
          {footer ? <View className="gap-3 border-t border-border bg-bg px-5 pb-3 pt-3">{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
