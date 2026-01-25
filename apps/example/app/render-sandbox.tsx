import { ScrollView, StyleSheet, View } from "react-native";
import { useRef } from "react";
import { Markdown, MarkdownNode } from "react-native-nitro-markdown";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";

export default function RenderScreen() {
  const tabHeight = useBottomTabHeight();
  const startTime = useRef<number>(0);

  const onParsingInProgress = () => {
    startTime.current = performance.now();
    console.log("Parsing started...");
  };

  const onParseComplete = (result: {
    raw: string;
    ast: MarkdownNode;
    text: string;
  }) => {
    const end = performance.now();
    const duration = (end - startTime.current).toFixed(2);
    console.log(`Parsing complete in ${duration}ms`, result.text.trim());
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingBottom: tabHeight + 20,
          paddingHorizontal: 16,
        }}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <Markdown
          options={{ gfm: true, math: true }}
          onParseComplete={onParseComplete}
          onParsingInProgress={onParsingInProgress}
        >
          {MARKDOWN1}
        </Markdown>
        <View style={styles.card} />
        <Markdown
          options={{ gfm: true, math: true }}
          onParseComplete={onParseComplete}
          onParsingInProgress={onParsingInProgress}
        >
          {MARKDOWN2}
        </Markdown>
        <View style={styles.card} />
        <Markdown
          options={{ gfm: true, math: true }}
          onParseComplete={onParseComplete}
          onParsingInProgress={onParsingInProgress}
        >
          {MARKDOWN3}
        </Markdown>
        <View style={styles.card} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b", // Zinc 950
  },
  scrollView: {
    flex: 1,
  },
  card: {
    borderRadius: 12,
    backgroundColor: "#1e1e2d", // Zinc 800
    padding: 20,
    height: 50,
    width: "100%",
  },
});

const MARKDOWN1 = `# Markdown Block 1

**Bold text** and *italic text* and ***bold italic text***.

__Alternative bold__ and _alternative italic_ and ___alternative bold italic___.

~~Strikethrough text~~ and ~~**strikethrough bold**~~ and ~~*strikethrough italic*~~.

Regular text with **bold in the middle** and more text.

A sentence with *multiple* **formatting** ***options*** mixed ~~together~~.
`;

const MARKDOWN2 = `# Markdown Block 2

| Feature | Description | Status | Performance |
|:--------|:------------|:-------|:------------|
| JSI Binding | Direct JS ↔️ C++ communication | ✅ | Microseconds |
| Native Threading | Background processing | ✅ | Optimized |
| Zero-Copy | No data duplication | ✅ | Memory efficient |
| Math Support | LaTeX expressions | ✅ | Full featured |
| GFM Tables | Advanced table rendering | ✅ | Complete spec |
`;

const MARKDOWN3 = `# Markdown Block 3

![Demo Image 1](https://picsum.photos/seed/markdown/300/150 "Demo Image 1")
![Demo Image 2](https://picsum.photos/seed/markdown/300/150 "Demo Image 2")
`;
