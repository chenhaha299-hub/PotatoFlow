import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const FILE_POLICIES = {
  pdf: { contentType: "application/pdf", disposition: "inline" },
  docx: {
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    disposition: "attachment",
  },
  txt: { contentType: "text/plain; charset=utf-8", disposition: "attachment" },
  md: { contentType: "text/markdown; charset=utf-8", disposition: "attachment" },
  jpg: { contentType: "image/jpeg", disposition: "inline" },
  jpeg: { contentType: "image/jpeg", disposition: "inline" },
  png: { contentType: "image/png", disposition: "inline" },
  webp: { contentType: "image/webp", disposition: "inline" },
  gif: { contentType: "image/gif", disposition: "inline" },
} as const;

type AllowedExtension = keyof typeof FILE_POLICIES;

function safeFileId(value: string) {
  return /^(source|image)-[a-zA-Z0-9-]+$/.test(value);
}

function fileKey(userId: string, fileId: string) {
  return `${encodeURIComponent(userId)}/${fileId}`;
}

function fileExtension(filename: string): AllowedExtension | null {
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  return extension in FILE_POLICIES ? (extension as AllowedExtension) : null;
}

function decodedFilename(value: string | null) {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded && !/[\r\n]/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function filenameFromDisposition(value: string | null) {
  const encoded = value?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return decodedFilename(encoded || null);
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function hasExpectedSignature(bytes: Uint8Array, extension: AllowedExtension) {
  if (extension === "txt" || extension === "md") {
    return !bytes.subarray(0, Math.min(bytes.length, 4096)).includes(0);
  }
  if (extension === "pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (extension === "docx") return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  if (extension === "jpg" || extension === "jpeg") {
    return startsWith(bytes, [0xff, 0xd8, 0xff]);
  }
  if (extension === "png") {
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (extension === "gif") {
    return startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  }
  return (
    extension === "webp" &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  );
}

function policyHeaders(filename: string | null, extension: AllowedExtension | null) {
  const headers = new Headers();
  const safeName = filename || "download";
  const policy = extension ? FILE_POLICIES[extension] : null;
  headers.set("Content-Type", policy?.contentType || "application/octet-stream");
  headers.set(
    "Content-Disposition",
    `${policy?.disposition || "attachment"}; filename*=UTF-8''${encodeURIComponent(safeName)}`,
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Cache-Control", "private, no-store");
  return headers;
}

async function bucket() {
  const { env } = await import("cloudflare:workers");
  if (!env.FILES) throw new Error("Cloud file storage is unavailable.");
  return env.FILES;
}

function unauthorized() {
  return NextResponse.json({ error: "请先登录后再同步文件。" }, { status: 401 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!safeFileId(id)) {
    return NextResponse.json({ error: "文件编号无效。" }, { status: 400 });
  }

  const object = await (await bucket()).get(fileKey(user.userId, id));
  if (!object) {
    return NextResponse.json({ error: "没有找到这个文件。" }, { status: 404 });
  }
  const storedHeaders = new Headers();
  object.writeHttpMetadata(storedHeaders);
  const metadataFilename =
    object.customMetadata?.filename ||
    filenameFromDisposition(storedHeaders.get("content-disposition"));
  const metadataExtension = fileExtension(metadataFilename || "");
  const headers = policyHeaders(metadataFilename, metadataExtension);
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!safeFileId(id)) {
    return NextResponse.json({ error: "文件编号无效。" }, { status: 400 });
  }
  const filename = decodedFilename(request.headers.get("x-file-name"));
  const extension = filename ? fileExtension(filename) : null;
  if (!filename || !extension) {
    return NextResponse.json(
      { error: "仅支持 PDF、DOCX、TXT、Markdown 和常用图片格式。" },
      { status: 415 },
    );
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "单个文件不能超过 20MB。" }, { status: 413 });
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "单个文件不能超过 20MB。" }, { status: 413 });
  }
  if (!hasExpectedSignature(new Uint8Array(bytes), extension)) {
    return NextResponse.json(
      { error: "文件内容与扩展名不一致，请选择正确的文件。" },
      { status: 415 },
    );
  }
  const policy = FILE_POLICIES[extension];
  await (await bucket()).put(fileKey(user.userId, id), bytes, {
    httpMetadata: {
      contentType: policy.contentType,
      contentDisposition: `${policy.disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
    customMetadata: { filename, extension },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!safeFileId(id)) {
    return NextResponse.json({ error: "文件编号无效。" }, { status: 400 });
  }
  await (await bucket()).delete(fileKey(user.userId, id));
  return NextResponse.json({ ok: true });
}
