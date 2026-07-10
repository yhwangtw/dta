// Client helpers for the file-management API (POST/DELETE on /api/files).
import { encodeFilePathForApi } from "@/lib/file-paths";

async function post(dirOrFile: string, body: object): Promise<{ error?: string }> {
  const res = await fetch(`/api/files/${encodeFilePathForApi(dirOrFile)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return { error: res.ok ? undefined : d.error ?? `HTTP ${res.status}` };
}

export function createFile(parentDir: string, name: string) {
  return post(parentDir, { action: "create-file", name });
}
export function createDir(parentDir: string, name: string) {
  return post(parentDir, { action: "create-dir", name });
}
export function renameEntry(fullPath: string, name: string) {
  return post(fullPath, { action: "rename", name });
}

export async function deleteEntry(fullPath: string): Promise<{ error?: string }> {
  const res = await fetch(`/api/files/${encodeFilePathForApi(fullPath)}`, { method: "DELETE" });
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return { error: res.ok ? undefined : d.error ?? `HTTP ${res.status}` };
}

export interface UploadResult { name: string; ok: boolean; error?: string }

export async function uploadFiles(dir: string, files: File[]): Promise<{ results: UploadResult[]; error?: string }> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  const res = await fetch(`/api/files/${encodeFilePathForApi(dir)}`, { method: "POST", body: form });
  const d = (await res.json().catch(() => ({}))) as { results?: UploadResult[]; error?: string };
  if (!res.ok) return { results: [], error: d.error ?? `HTTP ${res.status}` };
  return { results: d.results ?? [] };
}
