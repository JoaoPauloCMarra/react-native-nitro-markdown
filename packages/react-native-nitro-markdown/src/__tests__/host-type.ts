import type { ElementType } from "react";

export function hostType(name: string): ElementType {
  return name as ElementType;
}
