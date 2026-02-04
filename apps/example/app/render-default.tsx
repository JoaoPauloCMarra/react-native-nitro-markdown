import { ScrollView, StyleSheet, View } from "react-native";
import { Markdown } from "react-native-nitro-markdown";
import { COMPLEX_MARKDOWN } from "../markdown-test-data";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import { EXAMPLE_COLORS } from "../theme";

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
        <View style={styles.card}>
          <Markdown options={{ gfm: true, math: true }}>
            {COMPLEX_MARKDOWN}
          </Markdown>
        </View>
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
  scrollContent: {
    padding: 20,
  },
  card: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
  },
});
