import { StyleSheet, View, Platform } from "react-native";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import { EXAMPLE_COLORS } from "../theme";

export default function RootLayout() {
  const tabBarHeight = useBottomTabHeight();

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerStyle: {
            backgroundColor: EXAMPLE_COLORS.surface,
            borderBottomWidth: 1,
            borderBottomColor: EXAMPLE_COLORS.border,
            boxShadow: "none",
          },
          headerTintColor: EXAMPLE_COLORS.text,
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: "700",
            fontFamily: Platform.select({
              ios: "Avenir Next",
              android: "sans-serif-medium",
            }),
          },
          tabBarStyle: {
            backgroundColor: EXAMPLE_COLORS.surface,
            borderTopColor: EXAMPLE_COLORS.border,
            height: tabBarHeight,
            paddingTop: 8,
            paddingBottom: Platform.select({ ios: 30, android: 10 }),
          },
          tabBarActiveTintColor: EXAMPLE_COLORS.accent,
          tabBarInactiveTintColor: EXAMPLE_COLORS.textMuted,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
            marginTop: 4,
            fontFamily: Platform.select({
              ios: "Avenir Next",
              android: "sans-serif",
            }),
          },
        }}
      >
        <Tabs.Screen
          name="render-sandbox"
          options={
            ENABLE_SANDBOX_TAB
              ? {
                  title: "Sandbox",
                  tabBarLabel: "Sandbox",
                  tabBarIcon: ({ color, size: _size }) => (
                    <Ionicons name="play-circle" size={24} color={color} />
                  ),
                }
              : { href: null, tabBarStyle: { display: "none" } }
          }
        />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: EXAMPLE_COLORS.background,
  },
});

const ENABLE_SANDBOX_TAB = false;
