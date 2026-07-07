import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const dynamic = "force-dynamic";

// A reusable prompt template. `name` is the slash-menu handle (slugified, no
// spaces); `body` is the text inserted into the composer.
interface PromptTemplate {
  id: string;
  name: string;
  body: string;
}

interface PromptsFile {
  prompts: PromptTemplate[];
}

function getPromptsPath(): string {
  return join(getAgentDir(), "prompts.json");
}

function readPrompts(): PromptsFile {
  const path = getPromptsPath();
  if (!existsSync(path)) return { prompts: [] };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<PromptsFile>;
    const prompts = Array.isArray(raw.prompts)
      ? raw.prompts.filter(
          (p): p is PromptTemplate =>
            !!p && typeof p.id === "string" && typeof p.name === "string" && typeof p.body === "string",
        )
      : [];
    return { prompts };
  } catch {
    return { prompts: [] };
  }
}

function writePrompts(data: PromptsFile): void {
  const path = getPromptsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

// Slug for the slash handle: lowercase, spaces→hyphens, keep word chars and
// hyphens, cap length. Keeps `/name` unambiguous in the composer menu.
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9一-鿿_-]/g, "")
    .slice(0, 32);
}

// GET /api/prompts → { prompts: [...] }
export async function GET() {
  return NextResponse.json(readPrompts());
}

// POST /api/prompts  body: { id?, name, body } — create or update (upsert by id)
export async function POST(req: Request) {
  try {
    const body = await req.json() as { id?: unknown; name?: unknown; body?: unknown };
    if (typeof body.name !== "string" || !normalizeName(body.name)) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (typeof body.body !== "string" || !body.body.trim()) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }
    const name = normalizeName(body.name);
    const text = body.body;
    const data = readPrompts();
    const id = typeof body.id === "string" && body.id ? body.id : `p_${Date.now().toString(36)}`;
    const existingIdx = data.prompts.findIndex((p) => p.id === id);
    const entry: PromptTemplate = { id, name, body: text };
    if (existingIdx >= 0) data.prompts[existingIdx] = entry;
    else data.prompts.push(entry);
    writePrompts(data);
    return NextResponse.json({ prompts: data.prompts, saved: entry });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/prompts  body: { id } — remove one
export async function DELETE(req: Request) {
  try {
    const body = await req.json() as { id?: unknown };
    if (typeof body.id !== "string" || !body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const data = readPrompts();
    data.prompts = data.prompts.filter((p) => p.id !== body.id);
    writePrompts(data);
    return NextResponse.json({ prompts: data.prompts });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
