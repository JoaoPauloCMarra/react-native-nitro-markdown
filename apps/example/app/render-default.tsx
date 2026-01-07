import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Markdown } from "react-native-nitro-markdown";
import { COMPLEX_MARKDOWN } from "../markdown-test-data";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";

export default function RenderScreen() {
  const tabHeight = useBottomTabHeight();

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
        <Markdown options={{ gfm: true, math: true }}>
          {COMPLEX_MARKDOWN}
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
    // paddingBottom is dynamic now
  },
});
