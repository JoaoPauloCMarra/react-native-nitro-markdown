import { NitroModules } from "react-native-nitro-modules";
import type { MarkdownSession as MarkdownSessionSpec } from "./specs/MarkdownSession.nitro";

export type MarkdownSession = MarkdownSessionSpec;

export function createMarkdownSession(initialText?: string): MarkdownSession {
  const session =
    NitroModules.createHybridObject<MarkdownSession>("MarkdownSession");

  if (initialText !== undefined) {
    session.reset(initialText);
  }

  return session;
}
