import type { ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";

interface ListProps {
  ordered: boolean;
  start?: number;
  depth: number;
  children: ReactNode;
}

import { useMarkdownContext } from "../MarkdownContext";
import { useMemo } from "react";

export const List: React.FC<ListProps> = ({ depth, children }) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        list: {
          marginBottom: theme.spacing.m,
        },
        listNested: {
          marginLeft: theme.spacing.l,
          marginBottom: 0,
        },
      }),
    [theme]
  );
  return (
    <View style={[styles.list, depth > 0 && styles.listNested]}>
      {children}
    </View>
  );
};

interface ListItemProps {
  children: ReactNode;
  index: number;
  ordered: boolean;
  start: number;
}

export const ListItem: React.FC<ListItemProps> = ({
  children,
  index,
  ordered,
  start,
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
        },
        listItemContent: {
          flex: 1,
          flexShrink: 1,
          minWidth: 0,
        },
      }),
    [theme]
  );
  const bullet = ordered ? `${start + index}.` : "•";
  return (
    <View style={styles.listItem}>
      <Text style={styles.listBullet}>{bullet}</Text>
      <View style={styles.listItemContent}>{children}</View>
    </View>
  );
};

interface TaskListItemProps {
  children: ReactNode;
  checked: boolean;
}

export const TaskListItem: React.FC<TaskListItemProps> = ({
  children,
  checked,
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
          flexShrink: 1,
          minWidth: 0,
        },
      }),
    [theme]
  );
  return (
    <View style={styles.taskListItem}>
      <Text style={styles.taskCheckbox}>{checked ? "☑" : "☐"}</Text>
      <View style={styles.taskContent}>{children}</View>
    </View>
  );
};
