import { ScrollView, StyleSheet, View } from "react-native";
import { Markdown } from "react-native-nitro-markdown";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import { EXAMPLE_COLORS } from "../theme";

export default function RenderScreen() {
  const tabHeight = useBottomTabHeight();

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
        <Markdown options={{ gfm: true, math: true }}>{MARKDOWN1}</Markdown>
        <View style={styles.card} />
        <Markdown options={{ gfm: true, math: true }}>{MARKDOWN2}</Markdown>
        <View style={styles.card} />
        <Markdown options={{ gfm: true, math: true }}>{MARKDOWN3}</Markdown>
        <View style={styles.card} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: EXAMPLE_COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  card: {
    borderRadius: 12,
    backgroundColor: EXAMPLE_COLORS.surface,
    padding: 20,
    height: 50,
    width: "100%",
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
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
