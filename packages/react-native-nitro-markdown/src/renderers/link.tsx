import { useMemo, type FC, type ReactNode } from "react";
import {
  Text,
  StyleSheet,
  Linking,
  Platform,
  type TextStyle,
} from "react-native";
import { useMarkdownContext } from "../MarkdownContext";
import {
  getAllowedExternalHref,
  normalizeLinkHref,
} from "../utils/link-security";

type LinkProps = {
  href: string;
  children: ReactNode;
  style?: TextStyle;
};

export const Link: FC<LinkProps> = ({ href, children, style }) => {
  const { theme, onLinkPress } = useMarkdownContext();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        link: {
          color: theme.colors.link,
          textDecorationLine: "underline",
          textDecorationColor: theme.colors.link,
          fontFamily: theme.fontFamilies.regular,
          ...(Platform.OS === "android" && { includeFontPadding: false }),
        },
      }),
    [theme],
  );

  const handlePress = async () => {
    const normalizedHref = normalizeLinkHref(href);
    if (!normalizedHref) return;

    try {
      const shouldOpen = (await onLinkPress?.(normalizedHref)) !== false;
      if (!shouldOpen) return;

      const allowedExternalHref = getAllowedExternalHref(normalizedHref);
      if (!allowedExternalHref) return;

      const canOpen = await Linking.canOpenURL(allowedExternalHref);
      if (!canOpen) return;

      await Linking.openURL(allowedExternalHref);
    } catch {}
  };

  return (
    <Text style={[styles.link, style]} onPress={handlePress}>
      {children}
    </Text>
  );
};
