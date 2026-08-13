import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
import {
  createCloudSnapshot,
  deleteCloudSnapshot,
  readCloudSnapshot,
  updateCloudSnapshot,
} from "../../../db/sync-store";
import { validatePotatoFlowStore } from "../../store-snapshot-validation";

export const dynamic = "force-dynamic";

const MAX_SNAPSHOT_BYTES = 4_000_000;

function unauthorized() {
  return NextResponse.json(
    { error: "请先使用 ChatGPT 账号登录。" },
    { status: 401 },
  );
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();

  const snapshot = await readCloudSnapshot(user.userId);
  if (!snapshot) {
    return NextResponse.json(
      { snapshot: null, revision: 0, updated_at: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  let parsedSnapshot: unknown;
  try {
    parsedSnapshot = JSON.parse(snapshot.payload);
  } catch {
    return NextResponse.json(
      { error: "云端数据无法识别，请从本机备份重新上传。" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  const validation = validatePotatoFlowStore(parsedSnapshot);
  if (!validation.ok) {
    return NextResponse.json(
      { error: `云端数据格式无效：${validation.error}` },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      snapshot: parsedSnapshot,
      revision: snapshot.revision,
      updated_at: snapshot.updatedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_SNAPSHOT_BYTES) {
    return NextResponse.json({ error: "同步数据过大。" }, { status: 413 });
  }

  let body: { snapshot?: unknown; base_revision?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "同步数据无法识别。" }, { status: 400 });
  }
  const validation = validatePotatoFlowStore(body.snapshot);
  if (!validation.ok) {
    return NextResponse.json(
      { error: `这不是有效的 PotatoFlow 数据：${validation.error}` },
      { status: 400 },
    );
  }
  const baseRevision = Number(body.base_revision);
  if (!Number.isInteger(baseRevision) || baseRevision < 0) {
    return NextResponse.json({ error: "同步版本无效。" }, { status: 400 });
  }

  const payload = JSON.stringify(body.snapshot);
  if (new TextEncoder().encode(payload).byteLength > MAX_SNAPSHOT_BYTES) {
    return NextResponse.json({ error: "同步数据过大。" }, { status: 413 });
  }

  const saved =
    baseRevision === 0
      ? await createCloudSnapshot(user.userId, payload)
      : await updateCloudSnapshot(user.userId, payload, baseRevision);

  if (!saved) {
    const latest = await readCloudSnapshot(user.userId);
    return NextResponse.json(
      {
        error: "云端数据已经被另一台设备更新，请选择保留哪一份。",
        snapshot: latest ? JSON.parse(latest.payload) : null,
        revision: latest?.revision || 0,
        updated_at: latest?.updatedAt || null,
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({
    revision: saved.revision,
    updated_at: saved.updatedAt,
  });
}

async function deleteUserCloudFiles(userId: string) {
  const { env } = await import("cloudflare:workers");
  if (!env.FILES) return 0;
  const prefix = `${encodeURIComponent(userId)}/`;
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const result = await env.FILES.list({ prefix, cursor });
    const keys = result.objects.map((object) => object.key);
    if (keys.length) {
      await env.FILES.delete(keys);
      deleted += keys.length;
    }
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);
  return deleted;
}

export async function DELETE() {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  await deleteCloudSnapshot(user.userId);
  const deletedFiles = await deleteUserCloudFiles(user.userId);
  return NextResponse.json(
    { ok: true, deleted_files: deletedFiles },
    { headers: { "Cache-Control": "no-store" } },
  );
}
