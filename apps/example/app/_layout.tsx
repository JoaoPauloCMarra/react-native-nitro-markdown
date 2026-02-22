import { StyleSheet, Platform } from "react-native";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import { EXAMPLE_COLORS } from "../theme";

function RootTabs() {
  const tabBarHeight = useBottomTabHeight();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 0,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderTopWidth: 0,
            backgroundColor: EXAMPLE_COLORS.surface,
            height: tabBarHeight,
            paddingTop: 8,
            paddingBottom: insets.bottom + 8,
            boxShadow: `0px 8px 20px ${EXAMPLE_COLORS.text}24`,
            borderWidth: 1,
            borderColor: EXAMPLE_COLORS.border,
          },
          tabBarActiveTintColor: EXAMPLE_COLORS.accent,
          tabBarInactiveTintColor: EXAMPLE_COLORS.textMuted,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "700",
            marginTop: 4,
            fontFamily: Platform.select({
              ios: "Avenir Next",
              android: "sans-serif",
            }),
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Benchmark",
            tabBarLabel: "Bench",
            tabBarIcon: ({ color, size: _size }) => (
              <Ionicons name="speedometer-outline" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="render-default"
          options={{
            title: "Standard Markdown",
            tabBarLabel: "Default",
            tabBarIcon: ({ color, size: _size }) => (
              <Ionicons name="document-text-outline" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="render-default-styles"
          options={{
            title: "Style Overrides",
            tabBarLabel: "Styles",
            tabBarIcon: ({ color, size: _size }) => (
              <Ionicons name="color-palette-outline" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="render-custom"
          options={{
            title: "Custom Components",
            tabBarLabel: "Custom",
            tabBarIcon: ({ color, size: _size }) => (
              <Ionicons name="layers-outline" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="render-stream"
          options={{
            title: "Token Stream",
            tabBarLabel: "Stream",
            tabBarIcon: ({ color, size: _size }) => (
              <Ionicons name="flash-outline" size={24} color={color} />
            ),
            header: () => null,
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RootTabs />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: EXAMPLE_COLORS.background,
  },
});
