export function spyOnConsoleErrorIgnoringRendererDeprecation() {
  return jest
    .spyOn(console, "error")
    .mockImplementation((message?: unknown, ...args: unknown[]) => {
      if (
        typeof message === "string" &&
        message.includes("react-test-renderer is deprecated")
      ) {
        return;
      }
      process.stderr.write(
        [message, ...args].map((arg) => String(arg)).join(" ") + "\n",
      );
    });
}
