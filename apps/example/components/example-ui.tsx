import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { EXAMPLE_COLORS } from "../theme";

type ScreenProps = {
  children: ReactNode;
  paddingBottom: number;
  style?: StyleProp<ViewStyle>;
};

export function ExampleScreen({ children, paddingBottom, style }: ScreenProps) {
  return (
    <View style={styles.screen}>
      <View style={[styles.screenContent, { paddingBottom }, style]}>
        {children}
      </View>
    </View>
  );
}

type HeaderProps = {
  title: string;
  subtitle?: string;
};

export function ExampleHeader({ title, subtitle }: HeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

type PanelProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ExamplePanel({ children, style }: PanelProps) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

type ActionButtonProps = {
  children: ReactNode;
  active?: boolean;
  icon?: ReactNode;
  tone?: "primary" | "danger" | "neutral";
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
};

export function ExampleActionButton({
  children,
  active,
  icon,
  tone = "primary",
  style,
  onPress,
}: ActionButtonProps) {
  return (
    <Pressable
      style={[
        styles.button,
        tone === "primary" && styles.primaryButton,
        tone === "neutral" && styles.neutralButton,
        tone === "danger" && styles.dangerButton,
        active && styles.activeButton,
        style,
      ]}
      onPress={onPress}
    >
      {icon}
      <Text
        style={[
          styles.buttonText,
          tone === "primary" && styles.primaryButtonText,
          tone !== "primary" && styles.secondaryButtonText,
          active && styles.activeButtonText,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

type SectionLabelProps = {
  children: ReactNode;
};

export function ExampleSectionLabel({ children }: SectionLabelProps) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: EXAMPLE_COLORS.background,
  },
  screenContent: {
    flex: 1,
    padding: 20,
    gap: 12,
  },
  header: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: EXAMPLE_COLORS.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: EXAMPLE_COLORS.textMuted,
    lineHeight: 18,
  },
  panel: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
  },
  button: {
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  primaryButton: {
    backgroundColor: EXAMPLE_COLORS.accent,
  },
  neutralButton: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
  },
  dangerButton: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.dangerBorder,
  },
  activeButton: {
    borderColor: EXAMPLE_COLORS.accent,
    backgroundColor: EXAMPLE_COLORS.accentSoft,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  primaryButtonText: {
    color: EXAMPLE_COLORS.surface,
  },
  secondaryButtonText: {
    color: EXAMPLE_COLORS.text,
  },
  activeButtonText: {
    color: EXAMPLE_COLORS.accentDeep,
  },
  sectionLabel: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginLeft: 4,
  },
});
