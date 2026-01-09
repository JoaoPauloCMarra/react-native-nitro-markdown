import type { ReactNode } from "react";
import { Text, StyleSheet, Linking, TextStyle } from "react-native";

interface LinkProps {
  href: string;
  children: ReactNode;
  style?: TextStyle;
}

import { useMarkdownContext } from "../MarkdownContext";
import { useMemo } from "react";

export const Link: React.FC<LinkProps> = ({ href, children, style }) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        link: {
          color: theme.colors.link,
          textDecorationLine: "underline",
        },
      }),
    [theme]
  );

  const handlePress = () => {
    if (href) {
      Linking.openURL(href).catch((err) =>
        console.error("Failed to open URL:", err)
      );
    }
  };

  return (
    <Text style={[styles.link, style]} onPress={handlePress}>
      {children}
    </Text>
  );
};
