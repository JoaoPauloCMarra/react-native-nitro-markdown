import { ScrollView, StyleSheet, View } from "react-native";
import { Markdown, MarkdownNode } from "react-native-nitro-markdown";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";

export default function RenderScreen() {
  const tabHeight = useBottomTabHeight();

  const onParsingInProgress = () => {
    console.log("Parsing in progress");
  };

  const onParseComplete = (result: {
    raw: string;
    ast: MarkdownNode;
    text: string;
  }) => {
    console.log("Parsing complete", result.text);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: tabHeight + 20 },
        ]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <Markdown
          options={{ gfm: true, math: true }}
          onParseComplete={onParseComplete}
          onParsingInProgress={onParsingInProgress}
        >
          {MARKDOWN}
        </Markdown>
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
  scrollContent: {
    padding: 20,
  },
});

const MARKDOWN = `# Markdown

Add some markdown to test the rendering.

`;
