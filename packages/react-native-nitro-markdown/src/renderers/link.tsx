import { ReactNode, useMemo, type FC } from "react";
import {
  Text,
  StyleSheet,
  Linking,
  Platform,
  type TextStyle,
} from "react-native";
import { useMarkdownContext } from "../MarkdownContext";

interface LinkProps {
  href: string;
  children: ReactNode;
  style?: TextStyle;
}

export const Link: FC<LinkProps> = ({ href, children, style }) => {
  const { theme } = useMarkdownContext();
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
    [theme]
  );

  const handlePress = () => {
    if (href) Linking.openURL(href);
  };

  return (
    <Text style={[styles.link, style]} onPress={handlePress}>
      {children}
    </Text>
  );
};
