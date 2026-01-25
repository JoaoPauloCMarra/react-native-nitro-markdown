import { ReactNode, useMemo, type FC } from "react";
import { View, Text, StyleSheet, type ViewStyle } from "react-native";
import { useMarkdownContext } from "../MarkdownContext";

interface ListProps {
  ordered: boolean;
  start?: number;
  depth: number;
  children: ReactNode;
  style?: ViewStyle;
}

export const List: FC<ListProps> = ({ depth, children, style }) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        list: {
          marginBottom: theme.spacing.m,
        },
        listNested: {
          marginLeft: theme.spacing.s,
          marginBottom: 0,
        },
      }),
    [theme],
  );
  return (
    <View style={[styles.list, depth > 0 && styles.listNested, style]}>
      {children}
    </View>
  );
};

interface ListItemProps {
  children: ReactNode;
  index: number;
  ordered: boolean;
  start: number;
  style?: ViewStyle;
}

export const ListItem: FC<ListItemProps> = ({
  children,
  index,
  ordered,
  start,
  style,
}) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(
    () =>
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
          minWidth: 20,
          textAlign: "center",
          fontFamily: theme.fontFamilies.regular,
        },
        listItemContent: {
          flex: 1,
          minWidth: 0,
        },
      }),
    [theme],
  );
  const bullet = ordered ? `${start + index}.` : "•";
  return (
    <View style={[styles.listItem, style]}>
      <Text style={styles.listBullet}>{bullet}</Text>
      <View style={styles.listItemContent}>{children}</View>
    </View>
  );
};

interface TaskListItemProps {
  children: ReactNode;
  checked: boolean;
  style?: ViewStyle;
}

export const TaskListItem: FC<TaskListItemProps> = ({
  children,
  checked,
  style,
}) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        taskListItem: {
          flexDirection: "row",
          alignItems: "flex-start",
          marginBottom: theme.spacing.s,
        },
        taskCheckbox: {
          fontSize: theme.fontSizes.l,
          lineHeight: theme.fontSizes.m * 1.6,
          marginRight: theme.spacing.s,
          color: theme.colors.accent,
        },
        taskContent: {
          flex: 1,
          minWidth: 0,
        },
      }),
    [theme],
  );
  return (
    <View style={[styles.taskListItem, style]}>
      <Text style={styles.taskCheckbox}>{checked ? "☑" : "☐"}</Text>
      <View style={styles.taskContent}>{children}</View>
    </View>
  );
};
