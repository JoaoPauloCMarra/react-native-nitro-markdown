import "./setup";
import type { MarkdownNode } from "../headless";
import { createMarkdownSession } from "../MarkdownSession";
import {
  assertAcyclicMarkdownNode,
  cloneMarkdownNode,
  freezeMarkdownNode,
} from "../utils/freeze-ast";
import { extractTableData } from "../renderers/table/table-utils";
import { computeMeasuredColumnWidths } from "../renderers/table/table-measurement";
import { columnWidthsReducer } from "../renderers/table/table-reducer";
import { getAllowedExternalHref, getAllowedImageHref } from "../utils/link-security";
import {
  applyBeforeParsePlugins,
  sortPluginsByPriority,
  warnInDev,
} from "../utils/parse-pipeline";

describe("extractTableData with sparse trees", () => {
  it("skips non-row children and tolerates missing children arrays", () => {
    const table: MarkdownNode = {
      type: "table",
      children: [
        {
          type: "table_head",
          children: [
            { type: "text", content: "stray" },
            { type: "table_row" },
            {
              type: "table_row",
              children: [{ type: "table_cell", align: "right" }],
            },
          ],
        },
        {
          type: "table_body",
          children: [
            { type: "paragraph" },
            { type: "table_row" },
            { type: "table_row", children: [{ type: "table_cell" }] },
          ],
        },
        { type: "paragraph" },
      ],
    };

    const result = extractTableData(table);

    expect(result.headers).toHaveLength(1);
    expect(result.alignments).toEqual(["right"]);
    expect(result.headRow?.type).toBe("table_row");
    expect(result.rows).toEqual([[], [{ type: "table_cell" }]]);
    expect(result.rowNodes).toHaveLength(2);
  });

  it("keeps the head and body undefined for a bare table", () => {
    const result = extractTableData({ type: "table" });
    expect(result.head).toBeUndefined();
    expect(result.body).toBeUndefined();
    expect(result.headRow).toBeUndefined();
  });

  it("keeps the first head row when several are present", () => {
    const first: MarkdownNode = { type: "table_row", children: [] };
    const second: MarkdownNode = { type: "table_row", children: [] };
    const result = extractTableData({
      type: "table",
      children: [{ type: "table_head", children: [first, second] }],
    });
    expect(result.headRow).toBe(first);
  });
});

describe("computeMeasuredColumnWidths with missing measurements", () => {
  it("ignores absent and zero widths and applies the minimum", () => {
    const widths = computeMeasuredColumnWidths({
      measuredWidths: new Map([
        ["header-0", 0],
        ["cell-0-0", 30],
        ["cell-1-0", 0],
        ["header-2", 70],
      ]),
      columnCount: 3,
      rowCount: 2,
      minColumnWidth: 50,
      padding: 8,
    });

    expect(widths).toEqual([50, 50, 78]);
  });

  it("takes the widest of header and body cells", () => {
    expect(
      computeMeasuredColumnWidths({
        measuredWidths: new Map([
          ["header-0", 90],
          ["cell-0-0", 40],
        ]),
        columnCount: 1,
        rowCount: 1,
        minColumnWidth: 10,
        padding: 4,
      }),
    ).toEqual([94]);
  });
});

describe("columnWidthsReducer monotonic merge", () => {
  it("never shrinks a column and keeps the state when nothing grows", () => {
    const state = [100, 60];
    expect(
      columnWidthsReducer(state, { type: "SET_MONOTONIC_WIDTHS", widths: [80, 70] }),
    ).toEqual([100, 70]);
    expect(
      columnWidthsReducer(state, { type: "SET_MONOTONIC_WIDTHS", widths: [90, 50] }),
    ).toBe(state);
    expect(
      columnWidthsReducer(state, { type: "SET_MONOTONIC_WIDTHS", widths: [1, 2, 3] }),
    ).toEqual([1, 2, 3]);
  });
});

describe("plugin ordering and failure labels", () => {
  it("treats a missing priority as zero when sorting", () => {
    const low = { name: "low", priority: -1 };
    const unset = { name: "unset" };
    const high = { name: "high", priority: 2 };
    expect(sortPluginsByPriority([low, unset, high])?.map((p) => p.name)).toEqual([
      "high",
      "unset",
      "low",
    ]);
    expect(sortPluginsByPriority([])).toBeUndefined();
  });

  it("reports an unnamed failing beforeParse plugin and keeps the text", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const onError = jest.fn();
    const result = applyBeforeParsePlugins(
      "text",
      [
        {
          beforeParse: () => {
            throw new Error("boom");
          },
        },
        { name: "ignored-non-string", beforeParse: () => 5 as unknown as string },
      ],
      onError,
    );
    warn.mockRestore();

    expect(result).toBe("text");
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "before-plugin", undefined);
  });

  it("stays silent in warnInDev outside development", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const globals = globalThis as { __DEV__?: boolean };
    const original = globals.__DEV__;
    globals.__DEV__ = false;
    warnInDev("quiet");
    if (original === undefined) delete globals.__DEV__;
    else globals.__DEV__ = original;
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("session wrapper error mapping", () => {
  it("accepts property writes and rejects use after dispose with a typed error", () => {
    const session = createMarkdownSession();
    const native = session as unknown as { highlightPosition: number };
    expect(() => {
      native.highlightPosition = 3;
    }).not.toThrow();
    session.dispose();
    expect(() => session.getAllText()).toThrow(
      expect.objectContaining({ code: "destroyed", source: "session" }),
    );
  });
});

describe("AST validation limits and shapes", () => {
  const expectInvalid = (node: unknown, run: (n: MarkdownNode) => unknown) =>
    expect(() => run(node as MarkdownNode)).toThrow(
      expect.objectContaining({ code: "invalid_ast" }),
    );

  it("rejects nodes that are not plain objects", () => {
    const notPlain = Object.create(Date.prototype) as Record<string, unknown>;
    notPlain.type = "text";
    expectInvalid(notPlain, freezeMarkdownNode);
    expectInvalid(notPlain, cloneMarkdownNode);
    expectInvalid({ type: "document", children: {} }, assertAcyclicMarkdownNode);
  });

  it("accepts an object with a null prototype and plain trees", () => {
    const bare = Object.assign(Object.create(null), { type: "text", content: "x" });
    expect(() => assertAcyclicMarkdownNode(bare)).not.toThrow();
    expect(cloneMarkdownNode(bare)).toEqual({ type: "text", content: "x" });
  });

  it("rejects trees above the node budget while freezing and while cloning", () => {
    const leaves = Array.from({ length: 100_001 }, () => ({
      type: "text" as const,
      content: "x",
    }));
    const tree = { type: "document" as const, children: leaves };
    expectInvalid(tree, freezeMarkdownNode);
    expectInvalid(tree, cloneMarkdownNode);
  });

  it("rejects array slots above the budget", () => {
    const sparse = new Array<MarkdownNode>(250_001);
    expectInvalid({ type: "document", children: sparse }, assertAcyclicMarkdownNode);
  });
});

describe("href safety on empty and malformed input", () => {
  it("rejects empty links and images", () => {
    expect(getAllowedExternalHref("")).toBeNull();
    expect(getAllowedImageHref("   ")).toBeNull();
  });

  it("rejects links whose IPv6 literal is invalid", () => {
    expect(getAllowedExternalHref("https://[:::1]/x")).toBeNull();
    expect(getAllowedExternalHref("https://[::1]/x")).toBe("https://[::1]/x");
  });

  it("rejects non-http protocols for external links", () => {
    expect(getAllowedExternalHref("javascript:alert(1)")).toBeNull();
    expect(getAllowedExternalHref("https://example.com")).toBe("https://example.com");
  });
});
