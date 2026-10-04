import { useCallback, useState } from "react";
import { PixelRatio, Platform, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Markdown, defaultMarkdownTheme } from "react-native-nitro-markdown";
import { EXAMPLE_COLORS } from "../theme";

const HEADING_SIZE = defaultMarkdownTheme.fontSizes.h1;
const HEADING_LINE_HEIGHT = HEADING_SIZE * 1.3;
const HEADING_MARKDOWN = "# Scale";
const BODY_SIZE = defaultMarkdownTheme.fontSizes.m;
const BODY_LINE_HEIGHT = BODY_SIZE * 1.6;
const BODY_MARKDOWN = "Scale body";
const SCALED_FONT_THRESHOLD = 1.05;
const SCALED_BODY_RATIO = 1.15;
const HEADING_BOX_STYLES = {
  heading: { marginTop: 0, marginBottom: 0, paddingBottom: 0, borderBottomWidth: 0 },
};
const BODY_BOX_STYLES = { paragraph: { marginTop: 0, marginBottom: 0 } };

const measured = (height: number | null): height is number => height !== null && height > 0;

const useLayoutHeight = () => {
  const [height, setHeight] = useState<number | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setHeight((previous) => (previous === next ? previous : next));
  }, []);
  return [height, onLayout] as const;
};

export default function MarkdownTextScaleReplayScreen() {
  const insets = useSafeAreaInsets();
  const [headingHeight, onHeadingLayout] = useLayoutHeight();
  const [baseHeight, onBaseLayout] = useLayoutHeight();
  const [bodyHeight, onBodyLayout] = useLayoutHeight();
  const [bodyBaseHeight, onBodyBaseLayout] = useLayoutHeight();
  const fontScale = PixelRatio.getFontScale();

  const tokens = [
    `font-scale=${fontScale.toFixed(2)}`,
    `scaled=${fontScale > SCALED_FONT_THRESHOLD ? "yes" : "no"}`,
  ];
  if (measured(headingHeight) && measured(baseHeight)) {
    tokens.push(`h1=${Math.round(headingHeight)}:base=${Math.round(baseHeight)}`);
  }
  if (measured(bodyHeight) && measured(bodyBaseHeight)) {
    tokens.push(`body=${Math.round(bodyHeight)}:base=${Math.round(bodyBaseHeight)}`);
    tokens.push(`body-scaled=${bodyHeight >= bodyBaseHeight * SCALED_BODY_RATIO ? "yes" : "no"}`);
  }
  const label = `text-scale:${tokens.map((token) => `${token};`).join("")}`;

  return (
    <View testID="e2e-text-scale-screen" style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <View testID="text-scale-probe" accessible accessibilityLabel={label} style={styles.resultsProbe} />
      <View style={styles.content}>
        <View testID="text-scale-heading" onLayout={onHeadingLayout} style={styles.measure}>
          <Markdown styles={HEADING_BOX_STYLES}>{HEADING_MARKDOWN}</Markdown>
        </View>
        <View testID="text-scale-base" onLayout={onBaseLayout} style={styles.measure}>
          <Text allowFontScaling={false} style={styles.baseHeading}>
            Scale
          </Text>
        </View>
        <View testID="text-scale-body" onLayout={onBodyLayout} style={styles.measure}>
          <Markdown styles={BODY_BOX_STYLES}>{BODY_MARKDOWN}</Markdown>
        </View>
        <View testID="text-scale-body-base" onLayout={onBodyBaseLayout} style={styles.measure}>
          <Text allowFontScaling={false} style={styles.baseBody}>
            Scale body
          </Text>
        </View>
        <Text allowFontScaling={false} style={styles.token}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: EXAMPLE_COLORS.background },
  resultsProbe: { height: 1 },
  content: { paddingHorizontal: 16, gap: 8 },
  measure: { alignSelf: "stretch" },
  baseHeading: {
    fontSize: HEADING_SIZE,
    lineHeight: HEADING_LINE_HEIGHT,
    fontFamily: defaultMarkdownTheme.fontFamilies.heading,
    fontWeight: "700",
    letterSpacing: -0.6,
    ...(Platform.OS === "android" && { includeFontPadding: false }),
  },
  baseBody: {
    fontSize: BODY_SIZE,
    lineHeight: BODY_LINE_HEIGHT,
    fontFamily: defaultMarkdownTheme.fontFamilies.regular,
    ...(Platform.OS === "android" && { includeFontPadding: false }),
  },
  token: { color: EXAMPLE_COLORS.textMuted, fontFamily: "Menlo", fontSize: 12 },
});
