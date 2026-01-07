import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View, Text, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function RootLayout() {
  const tabBarHeight = useBottomTabHeight();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerStyle: {
            backgroundColor: "#09090b", // Zinc 950
            borderBottomWidth: 1,
            borderBottomColor: "#27272a", // Zinc 800
            shadowOpacity: 0,
            elevation: 0,
          },
          headerTintColor: "#f4f4f5", // Zinc 100
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: "700",
            fontFamily: Platform.select({
              ios: "System",
              android: "sans-serif-medium",
            }),
          },
          tabBarStyle: {
            backgroundColor: "#09090b", // Zinc 950
            borderTopColor: "#27272a", // Zinc 800
            height: tabBarHeight,
            paddingTop: 8,
            paddingBottom: Platform.select({ ios: 30, android: 10 }),
          },
          tabBarActiveTintColor: "#22c55e", // Green 500 (Nitro Green)
          tabBarInactiveTintColor: "#71717a", // Zinc 500
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
            marginTop: 4,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Benchmark",
            tabBarLabel: "Bench",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="speedometer-outline" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="render-default"
          options={{
            title: "Standard Markdown",
            tabBarLabel: "Default",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="document-text-outline" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="render-default-styles"
          options={{
            title: "Themed Markdown",
            tabBarLabel: "Themes",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="color-palette-outline" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="render-custom"
          options={{
            title: "Custom Components",
            tabBarLabel: "Custom",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="layers-outline" size={24} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
});
