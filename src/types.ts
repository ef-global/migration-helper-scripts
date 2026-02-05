/**
 * Visitor callback for JSON traversal.
 * Called for every node in the JSON tree.
 *
 * @param value - The current value being visited
 * @param key - The key (string for object properties, number for array indices)
 * @param path - Array of keys representing the path from root to this node
 */
export type VisitorCallback = (
  value: unknown,
  key: string | number,
  path: (string | number)[],
) => void;

/** Result of loading a file — either parsed data or a stream handle */
export type FileLoadResult =
  | { mode: "memory"; data: unknown }
  | { mode: "stream"; filePath: string };

/** A single component match from find-components */
export interface ComponentMatch {
  path: string;
  component: string;
  uid: string | null;
}

/** Size threshold for switching to streaming (512MB) */
export const STREAM_THRESHOLD_BYTES = 512 * 1024 * 1024;
