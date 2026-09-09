import { Link, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MarkdownE2eLab } from "../components/e2e-lab";
import { EXAMPLE_COLORS } from "../theme";

export default function MarkdownE2eScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      testID="e2e-screen"
      accessibilityLabel="E2E lab"
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 16,
        gap: 16,
      }}
    >
      <View>
        <Text testID="e2e-ready" style={styles.ready}>
          e2e-ready
        </Text>
        <Text style={styles.kicker}>react-native-nitro-markdown</Text>
        <Text style={styles.title}>E2E lab</Text>
        <Text style={styles.subtitle}>
          Deep link nitromarkdown://e2e. Human tabs stay the product demo.
        </Text>
        <Text testID="e2e-deeplink" style={styles.deeplink}>
          nitromarkdown://e2e
        </Text>
      </View>
      <MarkdownE2eLab />
      <Link href={"/e2e-render" as Href} asChild>
        <Pressable
          testID="open-e2e-render"
          accessibilityRole="link"
          accessibilityLabel="Open render wall"
          style={styles.renderLink}
        >
          <Text style={styles.renderLinkText}>Open render wall</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: EXAMPLE_COLORS.background,
  },
  ready: {
    color: "#059669",
    fontFamily: "Menlo",
    fontSize: 12,
    marginBottom: 8,
  },
  kicker: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  title: {
    color: EXAMPLE_COLORS.text,
    fontSize: 28,
    fontWeight: "700",
    marginTop: 4,
  },
  subtitle: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 14,
    marginTop: 6,
  },
  deeplink: {
    color: EXAMPLE_COLORS.textMuted,
    fontFamily: "Menlo",
    fontSize: 12,
    marginTop: 8,
  },
  renderLink: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderColor: EXAMPLE_COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  renderLinkText: {
    color: EXAMPLE_COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
});
