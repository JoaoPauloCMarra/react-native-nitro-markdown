import { ReactNode, useMemo, type FC } from "react";
import { Text, StyleSheet, Linking, type TextStyle } from "react-native";
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

