import type { FC, ReactNode } from "react";
import { View, Text, StyleSheet, Platform, type ViewStyle } from "react-native";
import { getCachedStyles } from "./style-cache";
import { useMarkdownContext } from "../MarkdownContext";
import type { MarkdownTheme } from "../theme";

type ListProps = {
  ordered: boolean;
  start?: number;
  depth: number;
  children: ReactNode;
  style?: ViewStyle;
};

// ordered/start stay on List for renderer API parity; markers render in ListItem.
export const List: FC<ListProps> = ({ depth, children, style }) => {
  const { theme } = useMarkdownContext();
  const styles = getCachedStyles(listStylesCache, theme, createListStyles);
  return (
    <View style={[styles.list, depth > 0 && styles.listNested, style]}>
      {children}
    </View>
  );
};

type ListItemProps = {
  children: ReactNode;
  index: number;
  ordered: boolean;
  start: number;
  style?: ViewStyle;
};

export const ListItem: FC<ListItemProps> = ({
  children,
  index,
  ordered,
  start,
  style,
}) => {
  const { theme } = useMarkdownContext();
  const styles = getCachedStyles(
    listItemStylesCache,
    theme,
    createListItemStyles,
  );
  const bullet = ordered ? `${start + index}.` : "•";
  return (
    <View style={[styles.listItem, style]}>
      <Text style={styles.listBullet}>{bullet}</Text>
      <View style={styles.listItemContent}>{children}</View>
    </View>
  );
};

type TaskListItemProps = {
  children: ReactNode;
  checked: boolean;
  style?: ViewStyle;
};

export const TaskListItem: FC<TaskListItemProps> = ({
  children,
  checked,
  style,
}) => {
  const { theme } = useMarkdownContext();
  const styles = getCachedStyles(
    taskListItemStylesCache,
    theme,
    createTaskListItemStyles,
  );
  return (
    <View style={[styles.taskListItem, style]}>
      <View
        style={[styles.taskCheckbox, checked && styles.taskCheckboxChecked]}
      >
        {checked ? <Text style={styles.taskCheckboxText}>✓</Text> : null}
      </View>
      <View style={styles.taskContent}>{children}</View>
    </View>
  );
};

type ListStyles = ReturnType<typeof createListStyles>;
type ListItemStyles = ReturnType<typeof createListItemStyles>;
type TaskListItemStyles = ReturnType<typeof createTaskListItemStyles>;

const listStylesCache = new WeakMap<MarkdownTheme, ListStyles>();
const listItemStylesCache = new WeakMap<MarkdownTheme, ListItemStyles>();
const taskListItemStylesCache = new WeakMap<
  MarkdownTheme,
  TaskListItemStyles
>();

const createListStyles = (theme: MarkdownTheme) =>
  StyleSheet.create({
    list: {
      marginBottom: theme.spacing.m,
    },
    listNested: {
      marginLeft: theme.spacing.s,
      marginBottom: 0,
    },
  });

const createListItemStyles = (theme: MarkdownTheme) =>
  StyleSheet.create({
    listItem: {
      flexDirection: "row",
      marginBottom: theme.spacing.s,
      alignItems: "flex-start",
    },
    listBullet: {
      color: theme.colors.accent,
      fontSize: theme.fontSizes.m,
      lineHeight: theme.fontSizes.m * 1.6,
      marginRight: theme.spacing.s,
      minWidth: 22,
      textAlign: "center",
      fontFamily: theme.fontFamilies.regular,
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    listItemContent: {
      flex: 1,
      minWidth: 0,
    },
  });

const createTaskListItemStyles = (theme: MarkdownTheme) =>
  StyleSheet.create({
    taskListItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: theme.spacing.s,
    },
    taskCheckbox: {
      width: 18,
      height: 18,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      marginRight: theme.spacing.s,
      marginTop: 2,
    },
    taskCheckboxChecked: {
      backgroundColor: theme.colors.accent,
    },
    taskCheckboxText: {
      color: theme.colors.surface,
      fontSize: 12,
      lineHeight: 12,
      fontWeight: "700",
      fontFamily: theme.fontFamilies.regular,
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    taskContent: {
      flex: 1,
      minWidth: 0,
    },
  });
