import { ScrollView, StyleSheet, View, Platform } from "react-native";
import {
  Markdown,
  Heading,
  Paragraph,
  lightMarkdownTheme,
} from "react-native-nitro-markdown";
import {
  COMPLEX_MARKDOWN,
  CUSTOM_RENDER_COMPONENTS,
} from "../markdown-test-data";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";

/**
 * Demonstrates the new DX features:
 * - Using pre-built lightMarkdownTheme
 * - Custom fontFamilies via theme
 * - Tag-based style overrides via `styles` prop
 * - Using default renderers with style override
 */
export default function RenderDefaultStylesScreen() {
  const tabHeight = useBottomTabHeight();

  // Custom theme extending the light preset
  const retroTheme = {
    ...lightMarkdownTheme,
    colors: {
      ...lightMarkdownTheme.colors,
      heading: "#e11d48",
      accent: "#e11d48",
      blockquote: "#fff1f2",
      tableBorder: "#fecdd3",
      tableHeader: "#fff1f2",
      tableHeaderText: "#e11d48",
      tableRowOdd: "#fff0f2",
    },
    fontFamilies: {
      regular: undefined,
      heading: Platform.select({ ios: "Courier", android: "monospace" }),
      mono: Platform.select({ ios: "Courier", android: "monospace" }),
    },
    fontSizes: {
      ...lightMarkdownTheme.fontSizes,
      m: 18,
    },
  };

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
        <Markdown
          options={{ gfm: true, math: true }}
          theme={retroTheme}
          // New: Tag-based style overrides
          styles={{
            paragraph: {
              backgroundColor: "rgba(0,0,0,0.02)",
              padding: 4,
              borderRadius: 4,
            },
            blockquote: {
              borderLeftColor: "#e11d48",
            },
          }}
          // Custom renderers still work for more control
          renderers={{
            heading: ({ level = 1, children }) => (
              <Heading level={level}>{children}</Heading>
            ),
            paragraph: ({ children }) => (
              <Paragraph
                style={{
                  backgroundColor: "rgba(0,0,0,0.02)",
                  padding: 4,
                  borderRadius: 4,
                }}
              >
                {children}
              </Paragraph>
            ),
          }}
        >
          {`${CUSTOM_RENDER_COMPONENTS}\n\n${COMPLEX_MARKDOWN}`}
        </Markdown>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
});
