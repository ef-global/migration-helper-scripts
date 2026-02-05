import type { VisitorCallback } from "../types.js";

/**
 * Recursively traverse a parsed JSON value, calling the visitor for every node.
 */
export function traverse(
  value: unknown,
  visitor: VisitorCallback,
  path: (string | number)[] = [],
): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const childPath = [...path, i];
      visitor(value[i], i, childPath);
      traverse(value[i], visitor, childPath);
    }
  } else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const childPath = [...path, key];
      const childValue = (value as Record<string, unknown>)[key];
      visitor(childValue, key, childPath);
      traverse(childValue, visitor, childPath);
    }
  }
}
