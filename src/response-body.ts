import type { Response } from "undici";

/** Limit decoded bytes while reading, including compressed responses. Never parse truncated JSON. */
export async function readLimited(res: Pick<Response, "body">, maxBytes: number): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("Invalid response size limit");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Response exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, total).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}

