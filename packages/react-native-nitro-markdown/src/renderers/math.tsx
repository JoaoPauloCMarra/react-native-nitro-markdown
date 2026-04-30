import type { FC, ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  PanResponder,
  StyleSheet,
  Platform,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { getCachedStyles } from "./style-cache";
import { useMarkdownContext } from "../MarkdownContext";
import type { MarkdownTheme } from "../theme";

let MathJaxComponent: ComponentType<{
  fontSize?: number;
  color?: string;
  fontCache?: boolean;
  style?: StyleProp<ViewStyle>;
  width?: number;
  height?: number;
  children?: string;
}> | null = null;
let SvgFromXmlComponent: ComponentType<{
  xml: string;
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}> | null = null;
let texToSvg: ((textext: string, fontSize?: number) => string) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mathJaxModule = require("react-native-mathjax-svg");
  MathJaxComponent = mathJaxModule.default || mathJaxModule;
  texToSvg = mathJaxModule.texToSvg ?? null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SvgFromXmlComponent = require("react-native-svg").SvgFromXml;
} catch {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(
      "[NitroMarkdown] react-native-mathjax-svg not found — math will render as plain text.",
    );
  }
}

type MathInlineProps = {
  content?: string;
  style?: ViewStyle;
};

type MathStyles = ReturnType<typeof createMathStyles>;

const mathStylesCache = new WeakMap<MarkdownTheme, MathStyles>();
const SVG_WIDTH_PATTERN = /<svg[^>]*\bwidth="([\d.]+)(?:ex|px)"/i;
const SVG_HEIGHT_PATTERN = /<svg[^>]*\bheight="([\d.]+)(?:ex|px)"/i;

function colorizeSvg(svg: string, color: string | undefined) {
  return color ? svg.replace(/currentColor/gim, color) : svg;
}

function createMathSvg(
  content: string,
  fontSize: number,
  color: string | undefined,
) {
  if (!texToSvg) return null;

  try {
    const xml = colorizeSvg(texToSvg(content, fontSize / 2), color);
    const widthMatch = SVG_WIDTH_PATTERN.exec(xml);
    const heightMatch = SVG_HEIGHT_PATTERN.exec(xml);
    if (!widthMatch || !heightMatch) return null;

    const width = Number.parseFloat(widthMatch[1]);
    const height = Number.parseFloat(heightMatch[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

    return { xml, width, height };
  } catch {
    return null;
  }
}

type HorizontalMathViewportProps = {
  children: ReactNode;
  contentWidth?: number;
  style: StyleProp<ViewStyle>;
  contentStyle: StyleProp<ViewStyle>;
};

const HorizontalMathViewport: FC<HorizontalMathViewportProps> = ({
  children,
  contentWidth,
  style,
  contentStyle,
}) => {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [measuredContentWidth, setMeasuredContentWidth] = useState(
    contentWidth ?? 0,
  );
  const [offset, setOffset] = useState(0);
  const viewportWidthRef = useRef(0);
  const contentWidthRef = useRef(contentWidth ?? 0);
  const offsetRef = useRef(0);
  const gestureStartOffsetRef = useRef(0);
  const [panHandlers, setPanHandlers] = useState<
    ReturnType<typeof PanResponder.create>["panHandlers"] | null
  >(null);

  const setClampedOffset = useCallback((nextOffset: number) => {
    const maxOffset = Math.max(
      0,
      contentWidthRef.current - viewportWidthRef.current,
    );
    const clampedOffset = Math.min(0, Math.max(-maxOffset, nextOffset));
    offsetRef.current = clampedOffset;
    setOffset(clampedOffset);
  }, []);

  useEffect(() => {
    if (typeof contentWidth !== "number") return;

    contentWidthRef.current = contentWidth;
    setMeasuredContentWidth(contentWidth);
    setClampedOffset(offsetRef.current);
  }, [contentWidth, setClampedOffset]);

  const handleViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportWidthRef.current = event.nativeEvent.layout.width;
      setViewportWidth(viewportWidthRef.current);
      setClampedOffset(offsetRef.current);
    },
    [setClampedOffset],
  );

  const handleContentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (typeof contentWidth === "number") return;

      contentWidthRef.current = event.nativeEvent.layout.width;
      setMeasuredContentWidth(contentWidthRef.current);
      setClampedOffset(offsetRef.current);
    },
    [contentWidth, setClampedOffset],
  );

  useEffect(() => {
    const responder = PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gestureState) => {
        const hasOverflow =
          contentWidthRef.current > viewportWidthRef.current + 1;
        const isHorizontal =
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) + 4;
        return hasOverflow && isHorizontal;
      },
      onPanResponderGrant: () => {
        gestureStartOffsetRef.current = offsetRef.current;
      },
      onPanResponderMove: (_event, gestureState) => {
        setClampedOffset(gestureStartOffsetRef.current + gestureState.dx);
      },
      onPanResponderTerminationRequest: () => false,
    });

    setPanHandlers(responder.panHandlers);
  }, [setClampedOffset]);

  const centeredOffset =
    measuredContentWidth > 0 && viewportWidth > measuredContentWidth
      ? (viewportWidth - measuredContentWidth) / 2
      : 0;

  return (
    <View
      style={style}
      onLayout={handleViewportLayout}
      pointerEvents="box-only"
      {...(panHandlers ?? {})}
    >
      <View
        style={[
          contentStyle,
          typeof contentWidth === "number" && { width: contentWidth },
          { transform: [{ translateX: centeredOffset + offset }] },
        ]}
        onLayout={handleContentLayout}
        pointerEvents="none"
      >
        {children}
      </View>
    </View>
  );
};

const createMathStyles = (theme: MarkdownTheme) =>
  StyleSheet.create({
    mathInlineContainer: {
      marginHorizontal: 2,
      justifyContent: "center",
    },
    mathInlineFallbackContainer: {
      backgroundColor: theme.colors.codeBackground,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 2,
      borderRadius: theme.borderRadius.s,
      marginHorizontal: 2,
    },
    mathInlineFallback: {
      fontFamily:
        theme.fontFamilies.mono ??
        Platform.select({ ios: "Courier", android: "monospace" }),
      fontSize: theme.fontSizes.s,
      color: theme.colors.code,
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    mathBlockContainer: {
      width: "100%",
      maxWidth: "100%",
      alignSelf: "stretch",
      marginVertical: theme.spacing.m,
      paddingVertical: theme.spacing.l,
      paddingHorizontal: theme.spacing.l,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.l,
      borderWidth: 1,
      borderColor: theme.colors.border,
      // Ensure we don't collapse if MathJax fails to report size immediately
      minHeight: 48,
      overflow: "hidden",
    },
    mathBlockScroll: {
      width: "100%",
      alignSelf: "stretch",
      maxWidth: "100%",
      overflow: "hidden",
    },
    mathBlockScrollContent: {
      alignSelf: "flex-start",
      alignItems: "center",
      justifyContent: "center",
    },
    mathBlockSvg: {
      backgroundColor: "transparent",
    },
    mathBlockSvgFrame: {
      flexShrink: 0,
    },
    mathBlockFallbackContainer: {
      width: "100%",
      maxWidth: "100%",
      alignSelf: "stretch",
      marginVertical: theme.spacing.m,
      paddingVertical: theme.spacing.m,
      paddingHorizontal: theme.spacing.l,
      backgroundColor: theme.colors.codeBackground,
      borderRadius: theme.borderRadius.m,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden",
    },
    mathBlockFallback: {
      fontFamily:
        theme.fontFamilies.mono ??
        Platform.select({ ios: "Courier", android: "monospace" }),
      fontSize: theme.fontSizes.m,
      color: theme.colors.code,
      textAlign: "center",
      flexShrink: 0,
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
  });

export const MathInline: FC<MathInlineProps> = ({ content, style }) => {
  const { theme } = useMarkdownContext();
  const styles = getCachedStyles(mathStylesCache, theme, createMathStyles);

  if (!content) return null;

  if (MathJaxComponent) {
    const fontSize = theme.fontSizes.s;
    return (
      <View style={[styles.mathInlineContainer, style]}>
        <MathJaxComponent
          fontSize={fontSize}
          color={theme.colors.text}
          fontCache={false}
          style={{ backgroundColor: "transparent" }}
        >
          {content}
        </MathJaxComponent>
      </View>
    );
  }

  return (
    <View style={[styles.mathInlineFallbackContainer, style]}>
      <Text style={styles.mathInlineFallback}>{content}</Text>
    </View>
  );
};

type MathBlockProps = {
  content?: string;
  style?: ViewStyle;
};

export const MathBlock: FC<MathBlockProps> = ({ content, style }) => {
  const { theme } = useMarkdownContext();
  const styles = getCachedStyles(mathStylesCache, theme, createMathStyles);

  if (!content) return null;

  const displayContent = `\\displaystyle ${content}`;
  const blockSvg =
    SvgFromXmlComponent &&
    createMathSvg(displayContent, theme.fontSizes.l, theme.colors.text);

  if (blockSvg && SvgFromXmlComponent) {
    return (
      <View style={[styles.mathBlockContainer, style]}>
        <HorizontalMathViewport
          style={styles.mathBlockScroll}
          contentStyle={styles.mathBlockScrollContent}
          contentWidth={blockSvg.width}
        >
          <View
            style={[
              styles.mathBlockSvgFrame,
              { width: blockSvg.width, height: blockSvg.height },
            ]}
          >
            <SvgFromXmlComponent
              xml={blockSvg.xml}
              width={blockSvg.width}
              height={blockSvg.height}
              style={styles.mathBlockSvg}
            />
          </View>
        </HorizontalMathViewport>
      </View>
    );
  }

  if (MathJaxComponent) {
    return (
      <View style={[styles.mathBlockContainer, style]}>
        <HorizontalMathViewport
          style={styles.mathBlockScroll}
          contentStyle={styles.mathBlockScrollContent}
        >
          <MathJaxComponent
            fontSize={theme.fontSizes.l}
            color={theme.colors.text}
            fontCache={false}
            style={{ backgroundColor: "transparent" }}
          >
            {displayContent}
          </MathJaxComponent>
        </HorizontalMathViewport>
      </View>
    );
  }

  return (
    <View style={[styles.mathBlockFallbackContainer, style]}>
      <HorizontalMathViewport
        style={styles.mathBlockScroll}
        contentStyle={styles.mathBlockScrollContent}
      >
        <Text style={styles.mathBlockFallback}>{content}</Text>
      </HorizontalMathViewport>
    </View>
  );
};
