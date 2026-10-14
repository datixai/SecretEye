import { Image } from "expo-image";
import { View } from "react-native";
import { Text } from "./ui";

const logo = require("../../assets/images/logo.png");

/** Brand mark used on auth screens. */
export function Logo({ size = 56, withName = true }: { size?: number; withName?: boolean }) {
  return (
    <View className="flex-row items-center gap-3">
      <Image source={logo} style={{ width: size, height: size }} contentFit="contain" />
      {withName ? (
        <Text variant="title">
          Secret<Text variant="title" tone="accent">Eye</Text>
        </Text>
      ) : null}
    </View>
  );
}
