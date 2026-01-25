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
    // paddingBottom is dynamic now
  },
});

const MARKDOWN = `# Markdown

Got it — it sounds like you want a reminder (not just a note). What time tomorrow should I set it for? If you don’t care, I can default to 9:00 AM. Any extra details to include in the reminder (call agenda, phone number, etc.)?

Which "Aaron Kelly" do you mean? 1. Aaron Kelly (Manager at Networkers International) 2. KELLY ALVES (Diretora de marketing at Gestão Agropecuária) 3. Josh Kelly (Founder at Randall Recruitment) 4. Kelly Tzung (Product Manager | Strategy Lead (ex-Fjord) at Accenture Song) Which one did you mean?

Test note: to call Aaron Kelly tomorrow at 11:00 AM — just testing the note feature.

Done — I saved the note about Aaron Kelly. Want me to also set a reminder for 11:00 AM tomorrow, or were you just testing notes?

`;
