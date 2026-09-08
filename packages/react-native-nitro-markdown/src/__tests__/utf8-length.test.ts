import { utf8ByteLength } from "../errors";

describe("UTF-8 input sizing", () => {
  it.each([
    "",
    "plain ASCII\n\t\0",
    "a".repeat(100_000),
    "a".repeat(100_000) + "é😀",
    "é中文😀",
    "\ud800",
    "\udc00",
    "\ud800x\udc00",
    "\ud800\ud800\udc00",
  ])("matches the platform encoder for %#", (text) => {
    expect(utf8ByteLength(text)).toBe(Buffer.byteLength(text, "utf8"));
  });

  it("matches deterministic strings containing arbitrary UTF-16 units", () => {
    let seed = 173;
    for (let sample = 0; sample < 500; sample += 1) {
      let text = "prefix ";
      for (let index = 0; index < 64; index += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        text += String.fromCharCode(seed & 0xffff);
      }
      expect(utf8ByteLength(text)).toBe(Buffer.byteLength(text, "utf8"));
    }
  });
});
