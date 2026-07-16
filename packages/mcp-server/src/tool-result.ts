export type TextToolResult =
  | { content: [{ type: "text"; text: string }] }
  | { content: [{ type: "text"; text: string }]; isError: true };

export async function toTextToolResult(operation: () => Promise<string>): Promise<TextToolResult> {
  try {
    const text = await operation();
    return { content: [{ type: "text", text }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
}
