import type { MarkdownNode, MarkdownNodeType } from "../headless";
import { invalidAstError } from "../errors";

export const MAX_AST_DEPTH = 256;
export const MAX_AST_NODES = 100_000;
export const MAX_AST_OBJECTS = 250_000;
export const MAX_AST_PROPERTIES = 1_000_000;
export const MAX_AST_ARRAY_SLOTS = 250_000;
export const MAX_AST_KEY_LENGTH = 256;
export const MAX_AST_STRING_BYTES = 8 * 1024 * 1024;
export const MAX_AST_TOTAL_STRING_BYTES = 64 * 1024 * 1024;

const NODE_TYPES: ReadonlySet<MarkdownNodeType> = new Set([
  "document",
  "heading",
  "paragraph",
  "text",
  "bold",
  "italic",
  "strikethrough",
  "link",
  "image",
  "code_inline",
  "code_block",
  "blockquote",
  "horizontal_rule",
  "line_break",
  "soft_break",
  "table",
  "table_head",
  "table_body",
  "table_row",
  "table_cell",
  "list",
  "list_item",
  "task_list_item",
  "math_inline",
  "math_block",
  "html_block",
  "html_inline",
]);

const NODE_KEYS: ReadonlySet<string> = new Set([
  "type",
  "content",
  "level",
  "href",
  "title",
  "alt",
  "language",
  "ordered",
  "start",
  "checked",
  "isHeader",
  "align",
  "beg",
  "end",
  "children",
  "metadata",
]);

type TraversalKind = "node" | "children" | "metadata" | "array";

type TraversalFrame = {
  value: object;
  keys: readonly PropertyKey[];
  index: number;
  kind: TraversalKind;
  depth: number;
};

type CloneFrame = {
  source: object;
  target: Record<PropertyKey, unknown> | unknown[];
  keys: readonly PropertyKey[];
  index: number;
  kind: TraversalKind;
  depth: number;
};

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isArray(value: unknown): value is readonly unknown[] {
  try {
    return Array.isArray(value);
  } catch {
    throw invalidAstError("AST values must be inspectable");
  }
}

function getKeys(value: object): readonly PropertyKey[] {
  try {
    if (isArray(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, "length");
      const length =
        descriptor !== undefined && typeof descriptor.value === "number"
          ? descriptor.value
          : -1;
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_AST_ARRAY_SLOTS) {
        throw invalidAstError("AST exceeds the maximum array slot count");
      }
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_AST_PROPERTIES) {
      throw invalidAstError("AST exceeds the maximum property count");
    }
    return keys;
  } catch (error) {
    if (error instanceof Error && error.name === "MarkdownError") throw error;
    throw invalidAstError("AST properties must be enumerable");
  }
}

function readDataProperty(value: object, key: PropertyKey): unknown {
  try {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      throw invalidAstError("AST accessors are not supported");
    }
    return descriptor.value;
  } catch {
    throw invalidAstError("AST properties must be plain data properties");
  }
}

function getArrayLength(value: readonly unknown[]): number {
  try {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, "length");
    const length =
      descriptor !== undefined && typeof descriptor.value === "number"
        ? descriptor.value
        : -1;
    if (!Number.isSafeInteger(length) || length < 0) {
      throw invalidAstError("AST arrays must have a valid length");
    }
    if (length > MAX_AST_ARRAY_SLOTS) {
      throw invalidAstError("AST exceeds the maximum array slot count");
    }
    return length;
  } catch (error) {
    if (error instanceof Error && error.name === "MarkdownError") throw error;
    throw invalidAstError("AST arrays must be inspectable");
  }
}

function isArrayIndex(key: PropertyKey): boolean {
  if (typeof key !== "string" || key === "length") return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && String(index) === key;
}

function keyName(key: PropertyKey): string {
  if (typeof key !== "string") {
    throw invalidAstError("AST keys must be strings");
  }
  if (key.length > MAX_AST_KEY_LENGTH) {
    throw invalidAstError("AST key exceeds the maximum length");
  }
  return key;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
    if (bytes > MAX_AST_STRING_BYTES) break;
  }
  return bytes;
}

function assertString(value: unknown, label: string, state: AstState): void {
  if (typeof value !== "string") {
    throw invalidAstError(`${label} must be a string`);
  }
  const bytes = utf8ByteLength(value);
  if (bytes > MAX_AST_STRING_BYTES) {
    throw invalidAstError(`${label} exceeds the maximum string size`);
  }
  state.stringBytes += bytes;
  if (state.stringBytes > MAX_AST_TOTAL_STRING_BYTES) {
    throw invalidAstError("AST exceeds the maximum string byte count");
  }
}

function assertFiniteInteger(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw invalidAstError(`${label} must be a non-negative integer`);
  }
}

function assertPlainObject(value: object, label: string): void {
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw invalidAstError(`${label} must be a plain object`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "MarkdownError") throw error;
    throw invalidAstError(`${label} must be inspectable`);
  }
}

type AstState = {
  objectCount: number;
  nodeCount: number;
  propertyCount: number;
  arraySlots: number;
  stringBytes: number;
  roles: WeakMap<object, TraversalKind>;
};

function assertMetadataPrimitive(value: unknown, state: AstState): void {
  if (value === null || value === undefined || typeof value === "boolean") return;
  if (typeof value === "string") {
    assertString(value, "AST metadata string", state);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw invalidAstError("AST metadata numbers must be finite");
    }
    return;
  }
  throw invalidAstError("AST metadata must contain JSON-like values");
}

function assertNodeProperty(
  key: string,
  value: unknown,
  state: AstState,
): void {
  if (!NODE_KEYS.has(key)) {
    throw invalidAstError(`unknown AST property: ${key}`);
  }

  switch (key) {
    case "type":
      assertString(value, "AST type", state);
      if (!NODE_TYPES.has(value as MarkdownNodeType)) {
        throw invalidAstError(`unknown AST node type: ${String(value)}`);
      }
      return;
    case "content":
    case "href":
    case "title":
    case "alt":
    case "language":
      if (value !== undefined) assertString(value, `AST ${key}`, state);
      return;
    case "level":
      if (value !== undefined) {
        if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 6) {
          throw invalidAstError("AST level must be an integer from 1 to 6");
        }
      }
      return;
    case "ordered":
    case "checked":
    case "isHeader":
      if (value !== undefined && typeof value !== "boolean") {
        throw invalidAstError(`AST ${key} must be a boolean`);
      }
      return;
    case "start":
    case "beg":
    case "end":
      if (value !== undefined) assertFiniteInteger(value, `AST ${key}`);
      return;
    case "align":
      if (
        value !== undefined &&
        value !== "left" &&
        value !== "center" &&
        value !== "right"
      ) {
        throw invalidAstError("AST align must be left, center, or right");
      }
      return;
    case "children":
      if (value !== undefined && !isArray(value)) {
        throw invalidAstError("AST children must be an array");
      }
      return;
    case "metadata":
      if (value !== undefined && !isObject(value)) {
        assertMetadataPrimitive(value, state);
      }
      return;
    default:
      return;
  }
}

function validateFrame(frame: TraversalFrame, state: AstState): void {
  const { value, kind } = frame;
  if (kind === "node") {
    assertPlainObject(value, "AST node");
    let typeFound = false;
    for (const key of frame.keys) {
      const name = keyName(key);
      state.propertyCount += 1;
      if (state.propertyCount > MAX_AST_PROPERTIES) {
        throw invalidAstError("AST exceeds the maximum property count");
      }
      if (name === "type") typeFound = true;
      assertNodeProperty(name, readDataProperty(value, key), state);
    }
    if (!typeFound) throw invalidAstError("AST node is missing its type");
    return;
  }

  if (kind === "children" || kind === "array") {
    const length = getArrayLength(value as readonly unknown[]);
    state.arraySlots += length;
    if (state.arraySlots > MAX_AST_ARRAY_SLOTS) {
      throw invalidAstError("AST exceeds the maximum array slot count");
    }
    const seenIndexes = new Set<number>();
    for (const key of frame.keys) {
      if (key === "length") continue;
      const name = keyName(key);
      if (!isArrayIndex(name)) {
        throw invalidAstError("AST arrays must contain only indexed values");
      }
      const index = Number(name);
      if (index >= length || seenIndexes.has(index)) {
        throw invalidAstError("AST arrays must be dense");
      }
      seenIndexes.add(index);
      state.propertyCount += 1;
      if (state.propertyCount > MAX_AST_PROPERTIES) {
        throw invalidAstError("AST exceeds the maximum property count");
      }
    }
    if (seenIndexes.size !== length) {
      throw invalidAstError("AST arrays must be dense");
    }
    return;
  }

  assertPlainObject(value, "AST metadata");
  for (const key of frame.keys) {
    keyName(key);
    state.propertyCount += 1;
    if (state.propertyCount > MAX_AST_PROPERTIES) {
      throw invalidAstError("AST exceeds the maximum property count");
    }
    const child = readDataProperty(value, key);
    if (isObject(child)) continue;
    assertMetadataPrimitive(child, state);
  }
}

function traverseAst(root: MarkdownNode, freeze: boolean): void {
  if (!isObject(root)) throw invalidAstError("AST root must be an object");

  const activePath = new Set<object>();
  const visited = new WeakSet<object>();
  const state: AstState = {
    objectCount: 0,
    nodeCount: 0,
    propertyCount: 0,
    arraySlots: 0,
    stringBytes: 0,
    roles: new WeakMap(),
  };
  const frames: TraversalFrame[] = [];

  const push = (value: object, kind: TraversalKind, depth: number): void => {
    if (depth > MAX_AST_DEPTH) {
      throw invalidAstError(`AST exceeds the maximum depth of ${MAX_AST_DEPTH}`);
    }
    const priorRole = state.roles.get(value);
    if (priorRole && priorRole !== kind && !(priorRole === "node" && kind === "node")) {
      throw invalidAstError("AST values cannot be shared across incompatible roles");
    }
    if (activePath.has(value)) {
      throw invalidAstError("cyclic AST references are not supported");
    }
    if (visited.has(value)) return;
    state.roles.set(value, kind);
    state.objectCount += 1;
    if (state.objectCount > MAX_AST_OBJECTS) {
      throw invalidAstError("AST exceeds the maximum reachable object count");
    }
    if (kind === "node") {
      state.nodeCount += 1;
      if (state.nodeCount > MAX_AST_NODES) {
        throw invalidAstError("AST exceeds the maximum node count");
      }
    }
    visited.add(value);
    activePath.add(value);
    const frame = { value, keys: getKeys(value), index: 0, kind, depth };
    frames.push(frame);
    validateFrame(frame, state);
  };

  push(root, "node", 0);
  while (frames.length > 0) {
    const frame = frames[frames.length - 1]!;
    if (frame.index >= frame.keys.length) {
      frames.pop();
      activePath.delete(frame.value);
      if (freeze) {
        try {
          Object.freeze(frame.value);
        } catch {
          throw invalidAstError("AST values could not be frozen");
        }
      }
      continue;
    }

    const key = frame.keys[frame.index]!;
    frame.index += 1;
    const child = readDataProperty(frame.value, key);
    if (!isObject(child)) {
      if (frame.kind === "children" && isArrayIndex(key)) {
        throw invalidAstError("AST children must contain node objects");
      }
      if (frame.kind === "array" && isArrayIndex(key)) {
        assertMetadataPrimitive(child, state);
      }
      continue;
    }

    if (frame.kind === "node") {
      if (key === "children") push(child, "children", frame.depth + 1);
      else if (key === "metadata") push(child, "metadata", frame.depth + 1);
    } else if (frame.kind === "children") {
      if (!isArrayIndex(key)) continue;
      if (!isObject(child)) {
        throw invalidAstError("AST children must contain node objects");
      }
      push(child, "node", frame.depth);
    } else if (frame.kind === "array") {
      if (isObject(child)) {
        push(child, isArray(child) ? "array" : "metadata", frame.depth + 1);
      } else {
        assertMetadataPrimitive(child, state);
      }
    } else {
      push(child, isArray(child) ? "array" : "metadata", frame.depth + 1);
    }
  }
}

export function freezeMarkdownNode(node: MarkdownNode): MarkdownNode {
  traverseAst(node, true);
  return node;
}

export function assertAcyclicMarkdownNode(node: MarkdownNode): void {
  traverseAst(node, false);
}

export function cloneMarkdownNode(node: MarkdownNode): MarkdownNode {
  assertAcyclicMarkdownNode(node);

  const sourceRoot = node as unknown as object;
  const rootTarget: Record<PropertyKey, unknown> = {};
  const clones = new WeakMap<object, Record<PropertyKey, unknown> | unknown[]>();
  const cloneState: AstState = {
    objectCount: 0,
    nodeCount: 0,
    propertyCount: 0,
    arraySlots: 0,
    stringBytes: 0,
    roles: new WeakMap(),
  };

  const validateCloneContainer = (
    value: object,
    kind: TraversalKind,
  ): void => {
    if (kind === "node") {
      assertPlainObject(value, "AST node");
      return;
    }
    if (kind === "metadata") assertPlainObject(value, "AST metadata");
  };

  const registerCloneObject = (
    value: object,
    kind: TraversalKind,
    keys: readonly PropertyKey[],
  ): void => {
    cloneState.objectCount += 1;
    if (cloneState.objectCount > MAX_AST_OBJECTS) {
      throw invalidAstError("AST exceeds the maximum reachable object count");
    }
    if (kind === "node") {
      cloneState.nodeCount += 1;
      if (cloneState.nodeCount > MAX_AST_NODES) {
        throw invalidAstError("AST exceeds the maximum node count");
      }
    }
    if (isArray(value)) {
      cloneState.arraySlots += getArrayLength(value);
      if (cloneState.arraySlots > MAX_AST_ARRAY_SLOTS) {
        throw invalidAstError("AST exceeds the maximum array slot count");
      }
    }
    cloneState.propertyCount += keys.filter((key) => key !== "length").length;
    if (cloneState.propertyCount > MAX_AST_PROPERTIES) {
      throw invalidAstError("AST exceeds the maximum property count");
    }
  };

  const defineCloneProperty = (
    target: Record<PropertyKey, unknown> | unknown[],
    key: PropertyKey,
    value: unknown,
  ): void => {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    });
  };

  const rootKeys = getKeys(sourceRoot);
  validateCloneContainer(sourceRoot, "node");
  registerCloneObject(sourceRoot, "node", rootKeys);
  clones.set(sourceRoot, rootTarget);
  const frames: CloneFrame[] = [
    {
      source: sourceRoot,
      target: rootTarget,
      keys: rootKeys,
      index: 0,
      kind: "node",
      depth: 0,
    },
  ];

  const cloneChild = (
    value: object,
    kind: TraversalKind,
    depth: number,
  ): Record<PropertyKey, unknown> | unknown[] => {
    const existing = clones.get(value);
    if (existing) return existing;
    if (depth > MAX_AST_DEPTH) {
      throw invalidAstError(`AST exceeds the maximum depth of ${MAX_AST_DEPTH}`);
    }
    validateCloneContainer(value, kind);
    const target = isArray(value) ? new Array(getArrayLength(value)) : {};
    const keys = getKeys(value);
    registerCloneObject(value, kind, keys);
    clones.set(value, target);
    frames.push({
      source: value,
      target,
      keys,
      index: 0,
      kind,
      depth,
    });
    return target;
  };

  while (frames.length > 0) {
    const frame = frames[frames.length - 1]!;
    if (frame.index >= frame.keys.length) {
      frames.pop();
      continue;
    }
    const key = frame.keys[frame.index]!;
    frame.index += 1;
    if ((frame.kind === "array" || frame.kind === "children") && key === "length") continue;
    const name = keyName(key);
    const value = readDataProperty(frame.source, key);
    if (frame.kind === "node") {
      assertNodeProperty(name, value, cloneState);
    } else if (frame.kind === "children") {
      if (!isArrayIndex(name) || !isObject(value)) {
        throw invalidAstError("AST children must contain node objects");
      }
    } else if (frame.kind === "array") {
      if (!isArrayIndex(name)) {
        throw invalidAstError("AST arrays must contain only indexed values");
      }
      if (!isObject(value)) assertMetadataPrimitive(value, cloneState);
    } else if (!isObject(value)) {
      assertMetadataPrimitive(value, cloneState);
    }
    let clonedValue = value;
    if (isObject(value)) {
      const childKind: TraversalKind =
        frame.kind === "node" && name === "children"
          ? "children"
          : frame.kind === "node" && name === "metadata"
            ? "metadata"
            : frame.kind === "children"
              ? "node"
              : isArray(value)
                ? "array"
                : "metadata";
      const childDepth =
        frame.kind === "children" ? frame.depth : frame.depth + 1;
      clonedValue = cloneChild(value, childKind, childDepth);
    }
    defineCloneProperty(frame.target, key, clonedValue);
  }

  const clonedRoot = rootTarget as MarkdownNode;
  assertAcyclicMarkdownNode(clonedRoot);
  return clonedRoot;
}
