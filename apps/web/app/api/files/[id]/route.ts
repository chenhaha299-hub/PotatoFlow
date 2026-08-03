import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md"]);

function safeFileId(value: string) {
  return /^source-[a-zA-Z0-9-]+$/.test(value);
}

function fileKey(userId: string, fileId: string) {
  return `${encodeURIComponent(userId)}/${fileId}`;
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
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, no-store");
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
  const filename = decodeURIComponent(request.headers.get("x-file-name") || "");
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json({ error: "仅支持 PDF、DOCX、TXT 和 Markdown。" }, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "单个文件不能超过 20MB。" }, { status: 413 });
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "单个文件不能超过 20MB。" }, { status: 413 });
  }
  await (await bucket()).put(fileKey(user.userId, id), bytes, {
    httpMetadata: {
      contentType: request.headers.get("content-type") || "application/octet-stream",
      contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
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
