import { router } from "expo-router";

/** Go back, or to Home if this screen was opened directly (deep link / web URL). */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}
