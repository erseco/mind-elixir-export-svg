import type { SvgExportWarningCode } from "./types.js";

export type SvgExportErrorCode =
  "NOT_INITIALIZED" | "INVALID_OPTIONS" | "INVALID_GEOMETRY" | "LIMIT_EXCEEDED" | "ABORTED";

/** Thrown when an export cannot produce a faithful, valid SVG. */
export class SvgExportError extends Error {
  readonly code: SvgExportErrorCode | SvgExportWarningCode;

  constructor(code: SvgExportErrorCode | SvgExportWarningCode, message: string) {
    super(message);
    this.name = "SvgExportError";
    this.code = code;
  }
}

/** Throws `ABORTED` when the signal has been aborted. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new SvgExportError("ABORTED", "The export was cancelled");
}
