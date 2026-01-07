import React, { useState, useMemo, ReactNode } from "react";
import { View, Text, Image as RNImage, StyleSheet } from "react-native";

import { parseMarkdownWithOptions, type MarkdownNode } from "../headless";
import type { NodeRendererProps } from "../MarkdownContext";

const renderInlineContent = (
  node: MarkdownNode,
  Renderer: React.ComponentType<NodeRendererProps>
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

interface ImageProps {
  url: string;
  title?: string;
  alt?: string;

  Renderer?: React.ComponentType<NodeRendererProps>;
}

import { useMarkdownContext } from "../MarkdownContext";

export const Image: React.FC<ImageProps> = ({ url, title, alt, Renderer }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
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
          height: 200,
          borderRadius: 8,
          backgroundColor: theme.colors.surface,
        },
        imageHidden: {
          opacity: 0,
          position: "absolute",
        },
        imageLoading: {
          width: "100%",
          height: 200,
          borderRadius: 8,
          backgroundColor: theme.colors.surface,
          justifyContent: "center",
          alignItems: "center",
        },
        imageLoadingText: {
          color: theme.colors.textMuted,
          fontSize: theme.fontSizes.s,
        },
        imageError: {
          width: "100%",
          padding: theme.spacing.l,
          borderRadius: 8,
          backgroundColor: theme.colors.surface,
          alignItems: "center",
          marginVertical: theme.spacing.m,
        },
        imageErrorText: {
          color: theme.colors.textMuted,
          fontSize: theme.fontSizes.s,
        },
        imageCaption: {
          color: theme.colors.textMuted,
          fontSize: theme.fontSizes.xs,
          marginTop: theme.spacing.s,
          fontStyle: "italic",
          textAlign: "center",
        },
      }),
    [theme]
  );

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
      <View style={styles.imageError}>
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
    <View style={styles.imageContainer}>
      {loading && (
        <View style={styles.imageLoading}>
          <Text style={styles.imageLoadingText}>Loading image...</Text>
        </View>
      )}
      <RNImage
        source={{ uri: url }}
        style={[styles.image, loading && styles.imageHidden]}
        resizeMode="contain"
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
      />
      {title && !loading && <Text style={styles.imageCaption}>{title}</Text>}
    </View>
  );
};
