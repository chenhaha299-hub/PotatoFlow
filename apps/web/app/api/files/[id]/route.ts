import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  decodedFilename,
  fileExtension,
  filePolicy,
  filenameFromDisposition,
  hasExpectedSignature,
  policyHeaders,
} from "../file-policy";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
function safeFileId(value: string) {
  return /^(source|image)-[a-zA-Z0-9-]+$/.test(value);
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
  const policy = filePolicy(extension);
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
