import { Link, type Href } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { EXAMPLE_COLORS } from "../theme";

export function E2eGate() {
  return (
    <Link href={"/e2e" as Href} asChild>
      <Pressable
        testID="open-e2e-lab"
        accessibilityRole="link"
        accessibilityLabel="Open E2E lab"
        style={styles.gate}
      >
        <Text style={styles.label}>E2E lab</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  gate: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingVertical: 6,
  },
  label: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
});
