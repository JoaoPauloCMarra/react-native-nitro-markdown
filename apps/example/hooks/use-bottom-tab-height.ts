import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TAB_BAR_BASE_HEIGHT = Platform.select({ ios: 40, android: 50 }) ?? 45;

export const useBottomTabHeight = () => {
  const insets = useSafeAreaInsets();
  return TAB_BAR_BASE_HEIGHT + insets.bottom + 10;
};
