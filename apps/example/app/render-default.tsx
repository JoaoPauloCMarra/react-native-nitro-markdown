import { StyleSheet } from "react-native";
import { Markdown } from "react-native-nitro-markdown";
import { ExampleHeader, ExamplePanel, ExampleScreen } from "../components/example-ui";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import { COMPLEX_MARKDOWN } from "../markdown-test-data";

export default function RenderScreen() {
  const tabHeight = useBottomTabHeight();

  return (
    <ExampleScreen paddingBottom={tabHeight + 20}>
      <ExampleHeader
        title="Default Renderer"
        subtitle="Full markdown support with opinionated native styles."
      />
      <ExamplePanel style={styles.card}>
        <Markdown
          options={{ gfm: true, math: true }}
          style={styles.markdown}
          virtualize={true}
          virtualization={{
            initialNumToRender: 10,
            maxToRenderPerBatch: 8,
            windowSize: 7,
          }}
        >
          {COMPLEX_MARKDOWN}
        </Markdown>
      </ExamplePanel>
    </ExampleScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  markdown: {
    flex: 1,
  },
});
