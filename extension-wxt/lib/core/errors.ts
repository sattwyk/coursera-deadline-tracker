import { TaggedError } from "better-result";

function messageFromCause(prefix: string, cause: unknown): string {
  if (cause instanceof Error) return `${prefix}: ${cause.message}`;
  return `${prefix}: ${String(cause)}`;
}

function previewValue(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 240);
  try {
    return JSON.stringify(value).slice(0, 240);
  } catch {
    return String(value).slice(0, 240);
  }
}

export class ExtensionRuntimeError extends TaggedError("ExtensionRuntimeError")<{
  operation: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { operation: string; cause: unknown }) {
    super({
      operation: args.operation,
      cause: args.cause,
      message: messageFromCause(args.operation, args.cause),
    });
  }
}

export class ExtensionHttpError extends TaggedError("ExtensionHttpError")<{
  operation: string;
  status: number;
  bodyPreview: string;
  message: string;
}>() {
  constructor(args: { operation: string; status: number; body: unknown; reason?: string }) {
    super({
      operation: args.operation,
      status: args.status,
      bodyPreview: previewValue(args.body),
      message: args.reason ? args.reason : `${args.operation} failed (HTTP ${args.status})`,
    });
  }
}

export class ExtensionInvalidResponseError extends TaggedError("ExtensionInvalidResponseError")<{
  operation: string;
  message: string;
}>() {
  constructor(args: { operation: string; message: string }) {
    super({
      operation: args.operation,
      message: args.message,
    });
  }
}

export class MissingDetectionError extends TaggedError("MissingDetectionError")<{
  kind: "userId" | "degreeId";
  message: string;
}>() {
  constructor(args: { kind: "userId" | "degreeId" }) {
    super({
      kind: args.kind,
      message:
        args.kind === "userId"
          ? "Could not detect Coursera user ID. Open a Coursera degree page and refresh once."
          : "Could not detect degree ID. Open a Coursera degree page and refresh once.",
    });
  }
}
