import { StyleSheet } from "react-native";
import { Markdown, type NodeStyleOverrides } from "react-native-nitro-markdown";
import { ExampleHeader, ExamplePanel, ExampleScreen } from "../components/example-ui";
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
    <ExampleScreen paddingBottom={tabHeight + 20}>
      <ExampleHeader
        title="Style Overrides"
        subtitle="Same markdown, customized through node-level style overrides."
      />
      <ExamplePanel style={styles.card}>
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
      </ExamplePanel>
    </ExampleScreen>
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
  card: {
    flex: 1,
  },
  markdown: {
    flex: 1,
  },
});
