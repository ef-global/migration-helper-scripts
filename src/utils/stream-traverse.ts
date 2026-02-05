import { createReadStream } from "node:fs";
import { parser } from "stream-json";
import type { VisitorCallback } from "../types.js";

/**
 * Stream-based JSON traversal for files too large to fit in memory.
 * Uses stream-json to parse incrementally and fires the visitor callback
 * for every value encountered, tracking the current path.
 */
export async function streamTraverse(
  filePath: string,
  visitor: VisitorCallback,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const jsonParser = parser();
    const pathStack: (string | number)[] = [];
    const containerStack: Array<{
      type: "object" | "array";
      index: number;
      pushed: boolean;
    }> = [];

    // Track whether we're inside an object key vs value
    let pendingKey: string | null = null;

    function enterContainer(type: "object" | "array") {
      const parent = containerStack[containerStack.length - 1];
      let pushed = false;

      if (pendingKey !== null) {
        pathStack.push(pendingKey);
        pendingKey = null;
        pushed = true;
      } else if (parent?.type === "array") {
        const index = parent.index;
        pathStack.push(index);
        parent.index += 1;
        pushed = true;
      }

      containerStack.push({ type, index: 0, pushed });
    }

    function exitContainer() {
      const state = containerStack.pop();
      if (state?.pushed) {
        pathStack.pop();
      }
    }

    function visitPrimitive(value: unknown) {
      const parent = containerStack[containerStack.length - 1];

      if (pendingKey !== null) {
        const currentPath = [...pathStack, pendingKey];
        visitor(value ?? null, pendingKey, currentPath);
        pendingKey = null;
        return;
      }

      if (parent?.type === "array") {
        const index = parent.index;
        parent.index += 1;
        const currentPath = [...pathStack, index];
        visitor(value ?? null, index, currentPath);
        return;
      }

      visitor(value ?? null, "", [...pathStack]);
    }

    jsonParser.on("data", (chunk: { name: string; value?: unknown }) => {
      const { name, value } = chunk;

      switch (name) {
        case "startObject":
        case "startArray":
          enterContainer(name === "startObject" ? "object" : "array");
          break;

        case "endObject":
        case "endArray":
          exitContainer();
          break;

        case "keyValue":
          pendingKey = value as string;
          break;

        case "stringValue":
        case "numberValue":
        case "trueValue":
        case "falseValue":
        case "nullValue": {
          visitPrimitive(value);
          break;
        }
      }
    });

    jsonParser.on("end", resolve);
    jsonParser.on("error", reject);

    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.pipe(jsonParser);
  });
}
