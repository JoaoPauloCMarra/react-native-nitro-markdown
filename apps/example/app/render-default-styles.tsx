import { ScrollView, StyleSheet, View, Platform } from "react-native";
import {
  Markdown,
  Heading,
  Paragraph,
  defaultMarkdownTheme,
} from "react-native-nitro-markdown";
import {
  COMPLEX_MARKDOWN,
  CUSTOM_RENDER_COMPONENTS,
} from "../markdown-test-data";

const retroTheme = {
  colors: {
    text: "#334155",
    textMuted: "#64748b",
    heading: "#e11d48",
    link: "#4f46e5",
    code: "#d97706",
    codeBackground: "#fef3c7",
    blockquote: "#fff1f2",
    border: "#fecdd3",
    surface: "#ffffff",
    surfaceLight: "#ffffff",
    accent: "#e11d48",
    tableBorder: "#fecdd3",
    tableHeader: "#fff1f2",
    tableHeaderText: "#e11d48",
    tableRowEven: "#ffffff",
    tableRowOdd: "#fff0f2",
  },
  fontSizes: {
    ...defaultMarkdownTheme.fontSizes,
    m: 18,
  },
};

import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";

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
        <Markdown
          options={{ gfm: true, math: true }}
          theme={retroTheme}
          renderers={{
            heading: ({ node, children }) => (
              <Heading
                level={node.level ?? 1}
                style={{
                  fontFamily: Platform.select({
                    ios: "Courier",
                    android: "monospace",
                  }),
                }}
              >
                {children}
              </Heading>
            ),
            paragraph: ({ children }) => (
              <Paragraph
                style={{
                  fontFamily: Platform.select({
                    ios: "Courier",
                    android: "monospace",
                  }),
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
    backgroundColor: "#F3F4F6", // Light background for retro theme
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
});
