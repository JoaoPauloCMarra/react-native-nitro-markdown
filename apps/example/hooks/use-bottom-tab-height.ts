import { Platform } from "react-native";

const TAB_BAR_HEIGHT = Platform.select({ ios: 90, android: 70 }) ?? 70;

export const useBottomTabHeight = () => {
  return TAB_BAR_HEIGHT;
};
