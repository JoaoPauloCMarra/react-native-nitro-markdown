import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Markdown,
  MarkdownStream,
  useMarkdownSession,
} from "react-native-nitro-markdown";
import { ExampleActionButton, ExampleHeader } from "../components/example-ui";
import { EXAMPLE_COLORS } from "../theme";

const CASES = [
  {
    name: "Bullet list",
    first: "- Visible bullet text",
    rest: " continues across several wrapped lines inside this narrow message bubble.\n- Second visible bullet\n  - Nested visible bullet",
  },
  {
    name: "Ordered list",
    first: "1. Visible ordered text",
    rest: " continues across several wrapped lines inside this narrow message bubble.\n2. Second visible item\n   1. Nested visible item",
  },
  {
    name: "Task list",
    first: "- [ ] Visible task text",
    rest: " continues across several wrapped lines inside this narrow message bubble.\n- [x] Completed visible task",
  },
  {
    name: "Block children",
    first: "- Short item\n\n  > Quote\n\n  ```ts\n  const x = 1;\n  ```",
    rest: "\n\n  Second paragraph stays inside the list item and wraps at the available width.",
  },
] as const;

type ListCaseProps = {
  item: (typeof CASES)[number];
};

function ListCase({ item }: ListCaseProps) {
  const session = useMarkdownSession();
  const [stage, setStage] = useState(0);
  const [width, setWidth] = useState(0);
  const text = [item.first, item.rest].slice(0, stage).join("");

  function append() {
    if (stage === 2) return;
    session.getSession().append(stage === 0 ? item.first : item.rest);
    setStage((current) => current + 1);
  }

  return (
    <>
      <ExampleActionButton onPress={append}>
        Append list tokens
      </ExampleActionButton>
      <Text style={styles.label}>
        {["Waiting for tokens", "First tokens", "All tokens appended"][stage]}
      </Text>
      <Text style={styles.label}>Streaming in a shrink-wrapped message</Text>
      <View style={styles.messageColumn}>
        <View
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={styles.message}
          testID="list-stream-bubble"
        >
          <MarkdownStream session={session} />
        </View>
      </View>
      <Text style={styles.label} testID="list-stream-layout">
        {`Shrink-wrap layout: ${width >= 120 ? "PASS" : "COLLAPSED"} (${Math.round(width)} px)`}
      </Text>
      <Text style={styles.label}>Static rendering at a fixed width</Text>
      <View style={styles.fixedMessage}>
        <Markdown>{text}</Markdown>
      </View>
    </>
  );
}

function ListLayoutScreen() {
  const [caseIndex, setCaseIndex] = useState(0);
  const item = CASES[caseIndex] ?? CASES[0];

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <ExampleHeader
        title="List layout regression"
        subtitle="List-first tokens, wrapping, and nested items"
      />
      <ExampleActionButton
        onPress={() => setCaseIndex((index) => (index + 1) % CASES.length)}
      >
        Next list case
      </ExampleActionButton>
      <Text style={styles.title}>{item.name}</Text>
      <ListCase key={item.name} item={item} />
    </ScrollView>
  );
}

export default ListLayoutScreen;

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    paddingBottom: 130,
    gap: 12,
    backgroundColor: EXAMPLE_COLORS.background,
  },
  title: { color: EXAMPLE_COLORS.text, fontSize: 20, fontWeight: "700" },
  label: { color: EXAMPLE_COLORS.textMuted, fontSize: 14 },
  messageColumn: { alignItems: "flex-start" },
  message: {
    maxWidth: 280,
    backgroundColor: EXAMPLE_COLORS.surface,
    borderColor: EXAMPLE_COLORS.border,
    borderWidth: 1,
  },
  fixedMessage: {
    width: 280,
    backgroundColor: EXAMPLE_COLORS.surface,
    borderColor: EXAMPLE_COLORS.border,
    borderWidth: 1,
  },
});
