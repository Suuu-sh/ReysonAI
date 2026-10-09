import { createHash } from "node:crypto";

const sha256 = value => createHash("sha256").update(value).digest("hex");

export function describeSourcePart(text, partStart, partChars) {
  if (typeof text !== "string" || !Number.isInteger(partStart) || partStart < 0
    || !Number.isInteger(partChars) || partChars < 1 || partStart >= text.length) {
    throw new TypeError("Invalid source text part coordinates.");
  }
  const body = text.slice(partStart, Math.min(text.length, partStart + partChars));
  const last = body.charCodeAt(body.length - 1);
  const next = text.charCodeAt(partStart + body.length);
  const splitSurrogateAtEnd = partStart + body.length < text.length && last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
  const bytes = Buffer.from(body, "utf8");
  return {
    body,
    metadata: { codeUnits: body.length, bytes: bytes.length, sha256: sha256(bytes), splitSurrogateAtEnd },
  };
}
