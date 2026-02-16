import {
  useState,
  useLayoutEffect,
  useMemo,
  type ReactNode,
  type FC,
  type ComponentType,
} from "react";
import {
  View,
  Text,
  Image as RNImage,
  StyleSheet,
  Platform,
  type ViewStyle,
} from "react-native";
import { parseMarkdownWithOptions, type MarkdownNode } from "../headless";
import { useMarkdownContext } from "../MarkdownContext";
import type { NodeRendererProps } from "../MarkdownContext";

const renderInlineContent = (
  node: MarkdownNode,
  Renderer: ComponentType<NodeRendererProps>,
): ReactNode => {
  if (node.type === "paragraph" && node.children) {
    return (
      <>
        {node.children.map((child, idx) => (
          <Renderer key={idx} node={child} depth={0} inListItem={false} />
        ))}
      </>
    );
  }
  return null;
};

type ImageProps = {
  url: string;
  title?: string;
  alt?: string;
  Renderer?: ComponentType<NodeRendererProps>;
  style?: ViewStyle;
};

export const Image: FC<ImageProps> = ({ url, title, alt, Renderer, style }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(undefined);
  const { theme } = useMarkdownContext();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        imageContainer: {
          marginVertical: theme.spacing.m,
          alignItems: "center",
        },
        image: {
          width: "100%",
          // If we have an aspect ratio, use it. Otherwise, use minHeight as fallback.
          aspectRatio: aspectRatio,
          minHeight: aspectRatio ? undefined : 200,
          borderRadius: theme.borderRadius.m,
          backgroundColor: theme.colors.surface,
        },
        imageHidden: {
          opacity: 0,
          position: "absolute",
        },
        imageLoading: {
          width: "100%",
          // Match the image size if possible
          aspectRatio: aspectRatio,
          height: aspectRatio ? undefined : 200,
          borderRadius: theme.borderRadius.m,
          backgroundColor: theme.colors.surface,
          justifyContent: "center",
          alignItems: "center",
        },
        imageLoadingText: {
          color: theme.colors.textMuted,
          fontSize: theme.fontSizes.s,
          fontFamily: theme.fontFamilies.regular,
          ...(Platform.OS === "android" && { includeFontPadding: false }),
        },
        imageError: {
          width: "100%",
          padding: theme.spacing.l,
          borderRadius: theme.borderRadius.m,
          backgroundColor: theme.colors.surface,
          alignItems: "center",
          marginVertical: theme.spacing.m,
        },
        imageErrorText: {
          color: theme.colors.textMuted,
          fontSize: theme.fontSizes.s,
          fontFamily: theme.fontFamilies.regular,
          ...(Platform.OS === "android" && { includeFontPadding: false }),
        },
        imageCaption: {
          color: theme.colors.textMuted,
          fontSize: theme.fontSizes.xs,
          marginTop: theme.spacing.s,
          fontStyle: "italic",
          textAlign: "center",
          fontFamily: theme.fontFamilies.regular,
          ...(Platform.OS === "android" && { includeFontPadding: false }),
        },
      }),
    [theme, aspectRatio],
  );

  useLayoutEffect(() => {
    // Fast path for consistent aspect ratios if checking picsum
    const picsumMatch = url.match(/picsum\.photos\/.*\/(\d+)\/(\d+)/);
    if (picsumMatch) {
      const w = parseInt(picsumMatch[1], 10);
      const h = parseInt(picsumMatch[2], 10);
      if (!isNaN(w) && !isNaN(h) && h !== 0) {
        setAspectRatio(w / h);
      }
    }

    RNImage.getSize(
      url,
      (width, height) => {
        if (width > 0 && height > 0) {
          setAspectRatio(width / height);
        }
      },
      () => {},
    );
  }, [url]);

  const altContent = useMemo(() => {
    if (!alt || !Renderer) return null;
    if (
      alt.includes("$") ||
      alt.includes("*") ||
      alt.includes("_") ||
      alt.includes("`") ||
      alt.includes("[")
    ) {
      try {
        const ast = parseMarkdownWithOptions(alt, { math: true, gfm: true });
        if (
          ast?.type === "document" &&
          ast.children?.[0]?.type === "paragraph"
        ) {
          const paragraph = ast.children[0];
          const inlineContent = renderInlineContent(paragraph, Renderer);
          if (inlineContent) {
            return inlineContent;
          }
        }
        return <Text style={styles.imageErrorText}>{alt}</Text>;
      } catch {
        return <Text style={styles.imageErrorText}>{alt}</Text>;
      }
    }
    return <Text style={styles.imageErrorText}>{alt}</Text>;
  }, [alt, Renderer, styles.imageErrorText]);

  if (error) {
    return (
      <View style={[styles.imageError, style]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Text style={styles.imageErrorText}>🖼️ </Text>
          {altContent || (
            <Text style={styles.imageErrorText}>
              {title || "Image failed to load"}
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.imageContainer, style]}>
      {loading && !aspectRatio ? (
        <View style={styles.imageLoading}>
          <Text style={styles.imageLoadingText}>Loading image...</Text>
        </View>
      ) : null}
      <RNImage
        source={{ uri: url }}
        style={[styles.image, loading && !aspectRatio && styles.imageHidden]}
        resizeMode="contain"
        onLoad={() => {
          setLoading(false);
        }}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
      />
      {title && !loading ? (
        <Text style={styles.imageCaption}>{title}</Text>
      ) : null}
    </View>
  );
};
