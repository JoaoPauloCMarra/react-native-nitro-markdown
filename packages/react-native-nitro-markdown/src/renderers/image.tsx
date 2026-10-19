import {
  useState,
  useEffect,
  useMemo,
  useRef,
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
import { useMarkdownContext } from "../MarkdownContext";
import { getAllowedImageHref } from "../utils/link-security";
import type { NodeRendererProps } from "../MarkdownContext";

type ImageProps = {
  url: string;
  title?: string;
  alt?: string;
  Renderer?: ComponentType<NodeRendererProps>;
  style?: ViewStyle;
};

export const Image: FC<ImageProps> = ({ url, title, alt, style }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(undefined);
  const mountedRef = useRef(true);
  const { theme, imageOptions } = useMarkdownContext();
  const allowedImageHref = useMemo(
    () => getAllowedImageHref(url, imageOptions),
    [imageOptions, url],
  );

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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(!allowedImageHref);
    setAspectRatio(undefined);

    if (!allowedImageHref) {
      return () => {
        isMounted = false;
      };
    }

    RNImage.getSize(
      allowedImageHref,
      (width, height) => {
        if (isMounted && width > 0 && height > 0) {
          setAspectRatio(width / height);
        }
      },
      (error) => {
        if (__DEV__) {
          console.warn(
            "[NitroMarkdown] Failed to get image dimensions:",
            error,
          );
        }
      },
    );

    return () => {
      isMounted = false;
    };
  }, [allowedImageHref]);

  const accessibilityLabel = alt || title || undefined;

  if (error || !allowedImageHref) {
    return (
      <View
        style={[styles.imageError, style]}
        accessible={Boolean(accessibilityLabel)}
        accessibilityRole={accessibilityLabel ? "image" : undefined}
        accessibilityLabel={accessibilityLabel}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Text style={styles.imageErrorText}>🖼️ </Text>
          <Text style={styles.imageErrorText}>
            {alt || title || "Image failed to load"}
          </Text>
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
        source={{ uri: allowedImageHref ?? "" }}
        style={[styles.image, loading && !aspectRatio && styles.imageHidden]}
        resizeMode="contain"
        accessible={Boolean(accessibilityLabel)}
        accessibilityRole={accessibilityLabel ? "image" : undefined}
        accessibilityLabel={accessibilityLabel}
        onLoad={() => {
          if (!mountedRef.current) return;
          setLoading(false);
        }}
        onError={() => {
          if (!mountedRef.current) return;
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
