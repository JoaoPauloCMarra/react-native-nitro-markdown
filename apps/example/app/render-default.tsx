import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Markdown } from "react-native-nitro-markdown";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import { COMPLEX_MARKDOWN } from "../markdown-test-data";
import { EXAMPLE_COLORS } from "../theme";

export default function RenderScreen() {
  const tabHeight = useBottomTabHeight();

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: tabHeight + 20 },
        ]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.title}>Default Renderer</Text>
          <Text style={styles.subtitle}>
            Full markdown support with opinionated native styles.
          </Text>
        </View>
        <View style={styles.card}>
          <Markdown options={{ gfm: true, math: true }}>
            {COMPLEX_MARKDOWN}
          </Markdown>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: EXAMPLE_COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 14,
  },
  hero: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
    boxShadow: `0px 8px 18px ${EXAMPLE_COLORS.text}1a`,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: EXAMPLE_COLORS.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: EXAMPLE_COLORS.textMuted,
    lineHeight: 20,
  },
  card: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
    boxShadow: `0px 8px 20px ${EXAMPLE_COLORS.text}14`,
  },
});
