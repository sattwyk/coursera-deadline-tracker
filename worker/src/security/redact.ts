export function redactSecrets(input: string): string {
  return input
    .replace(/CAUTH=[^;\\s]+/g, "CAUTH=[REDACTED]")
    .replace(/x-csrf3-token=[^;\\s]+/gi, "x-csrf3-token=[REDACTED]");
}
