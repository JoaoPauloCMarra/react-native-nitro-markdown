import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Markdown,
  darkMarkdownTheme,
  type NodeStyleOverrides,
  type PartialMarkdownTheme,
  type StylingStrategy,
} from "react-native-nitro-markdown";
import {
  ExampleActionButton,
  ExampleHeader,
  ExamplePanel,
  ExampleScreen,
} from "../components/example-ui";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import { EXAMPLE_COLORS } from "../theme";

type ThemeKey = "default" | "dark" | "minimal" | "custom";

const SHOWCASE = `# Theming demo

Render **bold**, _italic_, and [links](https://nitro.margelo.com) in your own palette.

> Blockquotes adopt the accent and surface colors.

- Lists, tables, and code all follow the theme
- Toggle the buttons above to compare

\`\`\`ts
const theme = darkMarkdownTheme;
session.append("Hello **Nitro**");
\`\`\`

| Token | Drives |
| ------ | ------ |
| accent | links and highlights |
| surface | code and quotes |

Inline math $a^2 + b^2 = c^2$ flows with the text.`;

const CUSTOM_THEME: PartialMarkdownTheme = {
  colors: {
    heading: "#7c3aed",
    link: "#db2777",
    accent: "#7c3aed",
    code: "#7c3aed",
    codeBackground: "#f5f3ff",
    blockquote: "#c4b5fd",
    border: "#ede9fe",
  },
  fontSizes: { h1: 30 },
  borderRadius: { m: 16, l: 20 },
};

const CUSTOM_STYLES: NodeStyleOverrides = {
  blockquote: {
    backgroundColor: "#f5f3ff",
    borderLeftColor: "#7c3aed",
  },
};

const OPTIONS: {
  key: ThemeKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "default", label: "Default", icon: "sunny-outline" },
  { key: "dark", label: "Dark", icon: "moon-outline" },
  { key: "minimal", label: "Minimal", icon: "remove-outline" },
  { key: "custom", label: "Custom", icon: "color-wand-outline" },
];

/**
 * Showcases the full theming toolkit on one markdown source:
 * - `stylingStrategy` switches the opinionated vs minimal baseline
 * - `theme` swaps the whole palette (the built-in `darkMarkdownTheme` preset)
 * - `theme` + `styles` layer a custom palette with per-node overrides
 */
export default function RenderThemingScreen() {
  const tabHeight = useBottomTabHeight();
  const [themeKey, setThemeKey] = useState<ThemeKey>("default");

  const isDark = themeKey === "dark";
  const stylingStrategy: StylingStrategy =
    themeKey === "minimal" ? "minimal" : "opinionated";
  const theme =
    themeKey === "dark"
      ? darkMarkdownTheme
      : themeKey === "custom"
        ? CUSTOM_THEME
        : undefined;
  const overrides = themeKey === "custom" ? CUSTOM_STYLES : undefined;

  return (
    <ExampleScreen paddingBottom={tabHeight + 20}>
      <ExampleHeader
        title="Theming"
        subtitle="One markdown source — swap the whole theme or override per node."
      />
      <View style={styles.tabs}>
        {OPTIONS.map((option) => {
          const active = themeKey === option.key;
          return (
            <ExampleActionButton
              key={option.key}
              active={active}
              tone="neutral"
              style={styles.tab}
              onPress={() => setThemeKey(option.key)}
              icon={
                <Ionicons
                  name={option.icon}
                  size={15}
                  color={
                    active ? EXAMPLE_COLORS.accent : EXAMPLE_COLORS.textMuted
                  }
                />
              }
            >
              {option.label}
            </ExampleActionButton>
          );
        })}
      </View>
      <ExamplePanel style={[styles.card, isDark && styles.darkCard]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Markdown
            theme={theme}
            styles={overrides}
            stylingStrategy={stylingStrategy}
            options={{ gfm: true, math: true }}
            highlightCode
          >
            {SHOWCASE}
          </Markdown>
        </ScrollView>
      </ExamplePanel>
    </ExampleScreen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 6,
  },
  card: {
    flex: 1,
    overflow: "hidden",
  },
  darkCard: {
    backgroundColor: darkMarkdownTheme.colors.surface,
    borderColor: "#334155",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 12,
  },
});
