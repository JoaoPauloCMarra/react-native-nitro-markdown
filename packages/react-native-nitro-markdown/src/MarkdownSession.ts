import { NitroModules } from "react-native-nitro-modules";
import type { MarkdownSession as MarkdownSessionSpec } from "./specs/MarkdownSession.nitro";

export type MarkdownSession = MarkdownSessionSpec;

export function createMarkdownSession(): MarkdownSession {
  return NitroModules.createHybridObject<MarkdownSession>("MarkdownSession");
}
