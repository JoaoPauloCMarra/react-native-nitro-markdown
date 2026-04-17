import { StyleSheet, Text, View } from "react-native";
import { Markdown, type NodeStyleOverrides } from "react-native-nitro-markdown";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import {
  COMPLEX_MARKDOWN,
  CUSTOM_RENDER_COMPONENTS,
} from "../markdown-test-data";
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
      <View style={[styles.content, { paddingBottom: tabHeight + 20 }]}>
        <View style={styles.hero}>
          <Text style={styles.title}>Style Overrides</Text>
          <Text style={styles.subtitle}>
            Same markdown, customized through node-level style overrides.
          </Text>
        </View>
        <View style={styles.card}>
          <Markdown
            options={{ gfm: true, math: true }}
            styles={STYLE_OVERRIDES}
            style={styles.markdown}
            virtualize={true}
            virtualization={{
              initialNumToRender: 10,
              maxToRenderPerBatch: 8,
              windowSize: 7,
            }}
          >
            {`${CUSTOM_RENDER_COMPONENTS}\n\n${COMPLEX_MARKDOWN}`}
          </Markdown>
        </View>
      </View>
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
  content: {
    flex: 1,
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
    flex: 1,
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
    boxShadow: `0px 8px 20px ${EXAMPLE_COLORS.text}14`,
  },
  markdown: {
    flex: 1,
  },
});
