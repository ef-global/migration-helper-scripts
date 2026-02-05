import { STREAM_THRESHOLD_BYTES } from "../types.js";
import type { VisitorCallback } from "../types.js";
import { traverse } from "./traverse.js";
import { streamTraverse } from "./stream-traverse.js";

/**
 * Process a JSON file with a visitor callback.
 * Automatically picks in-memory JSON.parse for small files
 * and streaming for files >= 512MB.
 */
export async function processFile(
  filePath: string,
  visitor: VisitorCallback,
): Promise<void> {
  const file = Bun.file(filePath);
  const size = file.size;

  if (size < STREAM_THRESHOLD_BYTES) {
    const text = await file.text();
    const data = JSON.parse(text);
    traverse(data, visitor);
  } else {
    await streamTraverse(filePath, visitor);
  }
}
