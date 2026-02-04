import { ScrollView, StyleSheet, View } from "react-native";
import {
  Markdown,
  type NodeStyleOverrides,
} from "react-native-nitro-markdown";
import {
  COMPLEX_MARKDOWN,
  CUSTOM_RENDER_COMPONENTS,
} from "../markdown-test-data";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import { EXAMPLE_COLORS } from "../theme";

/**
 * Demonstrates the style override workflow:
 * - Tag-based overrides via `styles`
 * - Neutral defaults that are easy to layer on top of
 */
export default function RenderDefaultStylesScreen() {
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
        <View style={styles.card}>
          <Markdown options={{ gfm: true, math: true }} styles={STYLE_OVERRIDES}>
            {`${CUSTOM_RENDER_COMPONENTS}\n\n${COMPLEX_MARKDOWN}`}
          </Markdown>
        </View>
      </ScrollView>
    </View>
  );
}

const STYLE_OVERRIDES: NodeStyleOverrides = {
  heading: {
    color: EXAMPLE_COLORS.info,
    letterSpacing: -0.4,
  },
  text: {
    color: EXAMPLE_COLORS.text,
    lineHeight: 26,
  },
  paragraph: {
    backgroundColor: EXAMPLE_COLORS.surfaceMuted,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
  },
  blockquote: {
    borderLeftColor: EXAMPLE_COLORS.info,
    backgroundColor: EXAMPLE_COLORS.infoSoft,
  },
  code_block: {
    backgroundColor: EXAMPLE_COLORS.surfaceMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
  },
  code_inline: {
    backgroundColor: EXAMPLE_COLORS.surfaceMuted,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  horizontal_rule: {
    backgroundColor: EXAMPLE_COLORS.border,
  },
};

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
    paddingBottom: 120,
  },
  card: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
  },
});
