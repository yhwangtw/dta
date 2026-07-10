import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  IGNORED_NAMES,
  IGNORED_SUFFIXES,
  TEXT_PREVIEW_MAX_BYTES,
  IMAGE_PREVIEW_MAX_BYTES,
  DOCX_PREVIEW_MAX_BYTES,
  filePathFromSegments,
  getAllowedRoots,
  isPathAllowed,
} from "@/lib/file-security";
import {
  getExt,
  getImageMime,
  getAudioMime,
  getDocumentMime,
  getLanguage,
  documentPreviewKind,
} from "@/lib/file-mime";
import { streamFile, wrapDocxPreviewHtml } from "@/lib/file-stream";
import { readTextPrefixSync } from "@/lib/text-prefix";

async function handleRead(
  filePath: string,
  stat: fs.Stats,
  request: NextRequest
): Promise<Response> {
  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not a file" }, { status: 400 });
  }
  const imageMime = getImageMime(filePath);
  if (imageMime) {
    if (stat.size > IMAGE_PREVIEW_MAX_BYTES) {
      return NextResponse.json({ error: "Image too large (>10MB)" }, { status: 413 });
    }
    return streamFile(filePath, stat, imageMime, request.headers.get("range"));
  }
  const audioMime = getAudioMime(filePath);
  if (audioMime) {
    return streamFile(filePath, stat, audioMime, request.headers.get("range"));
  }
  const documentMime = getDocumentMime(filePath);
  if (documentMime) {
    return streamFile(filePath, stat, documentMime, request.headers.get("range"));
  }
  const language = getLanguage(filePath);
  if (stat.size > TEXT_PREVIEW_MAX_BYTES) {
    // Partial preview instead of a refusal: first 256KB (on a UTF-8 char
    // boundary) + truncated flag. The viewer shows a banner with a download
    // link and disables editing (saving a prefix would destroy the file).
    const content = readTextPrefixSync(filePath, TEXT_PREVIEW_MAX_BYTES);
    return NextResponse.json({ content, language, size: stat.size, truncated: true });
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return NextResponse.json({ content, language, size: stat.size });
}

function handleMeta(filePath: string, stat: fs.Stats): Response {
  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not a file" }, { status: 400 });
  }
  const imageMime = getImageMime(filePath);
  const audioMime = getAudioMime(filePath);
  const documentMime = getDocumentMime(filePath);
  return NextResponse.json({
    size: stat.size,
    language: getLanguage(filePath),
    mime: imageMime || audioMime || documentMime || "text/plain",
    previewKind: documentPreviewKind(filePath),
  });
}

async function handlePreview(filePath: string, stat: fs.Stats): Promise<Response> {
  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not a file" }, { status: 400 });
  }
  if (getExt(filePath) !== "docx") {
    return NextResponse.json({ error: "Preview not available for this file type" }, { status: 400 });
  }
  if (stat.size > DOCX_PREVIEW_MAX_BYTES) {
    return NextResponse.json({ error: "DOCX too large for preview (>10MB)" }, { status: 413 });
  }

  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml(
    { path: filePath },
    {
      externalFileAccess: false,
      convertImage: mammoth.images.dataUri,
    }
  );
  const html = wrapDocxPreviewHtml(result.value, path.basename(filePath));
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function handleWatch(filePath: string, stat: fs.Stats): Response {
  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not a file" }, { status: 400 });
  }
  let watcher: fs.FSWatcher | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = (eventName: string, data: Record<string, unknown>) => {
        const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(new TextEncoder().encode(payload));
        } catch {
          // client disconnected
        }
      };
      // Send initial ping so client knows connection is live
      send("connected", { filePath });
      try {
        watcher = fs.watch(filePath, () => {
          try {
            const s = fs.statSync(filePath);
            send("change", { mtime: s.mtime.toISOString(), size: s.size });
          } catch {
            send("change", { mtime: new Date().toISOString(), size: 0 });
          }
        });
        watcher.on("error", () => {
          try { controller.close(); } catch { /* ignore */ }
        });
      } catch {
        send("error", { message: "Failed to watch file" });
        controller.close();
      }
    },
    cancel() {
      try { watcher?.close(); } catch { /* ignore */ }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function handleList(filePath: string, stat: fs.Stats): Response {
  if (!stat.isDirectory()) {
    return NextResponse.json({ error: "Not a directory" }, { status: 400 });
  }

  const names = fs.readdirSync(filePath);
  const entries = names
    .filter((name) => !IGNORED_NAMES.has(name) && !IGNORED_SUFFIXES.some((s) => name.endsWith(s)))
    .map((name) => {
      const full = path.join(filePath, name);
      try {
        const s = fs.statSync(full);
        return {
          name,
          isDir: s.isDirectory(),
          size: s.isFile() ? s.size : 0,
          modified: s.mtime.toISOString(),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Dirs first, then files, both alphabetically
      if (a!.isDir !== b!.isDir) return a!.isDir ? -1 : 1;
      return a!.name.localeCompare(b!.name);
    });

  return NextResponse.json({ entries, path: filePath });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await params;
    const filePath = filePathFromSegments(segments);
    const type = request.nextUrl.searchParams.get("type") ?? "list";

    const allowedRoots = await getAllowedRoots();
    if (!isPathAllowed(filePath, allowedRoots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    switch (type) {
      case "read":
        return handleRead(filePath, stat, request);
      case "download": {
        // Any file, any size — streamed with an attachment disposition so the
        // browser saves it instead of previewing.
        if (!stat.isFile()) {
          return NextResponse.json({ error: "Not a file" }, { status: 400 });
        }
        const mime = getImageMime(filePath) || getAudioMime(filePath) || getDocumentMime(filePath) || "application/octet-stream";
        return streamFile(filePath, stat, mime, request.headers.get("range"), "attachment");
      }
      case "raw": {
        // Any file, any size — streamed inline so the browser renders it
        // (the HTML preview iframe points its src here; no preview size cap).
        if (!stat.isFile()) {
          return NextResponse.json({ error: "Not a file" }, { status: 400 });
        }
        const ext = getExt(filePath);
        const mime =
          ext === "html" || ext === "htm"
            ? "text/html; charset=utf-8"
            : getImageMime(filePath) || getAudioMime(filePath) || getDocumentMime(filePath) || "text/plain; charset=utf-8";
        return streamFile(filePath, stat, mime, request.headers.get("range"), "inline");
      }
      case "meta":
        return handleMeta(filePath, stat);
      case "preview":
        return handlePreview(filePath, stat);
      case "watch":
        return handleWatch(filePath, stat);
      case "list":
      default:
        return handleList(filePath, stat);
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PUT /api/files/<path>  body: { content: string }
// Saves a text file edited in the viewer. Existing files only (no create),
// same allowed-roots gate as reads, capped at the text-preview limit so the
// editor and the reader agree on what "a text file" is.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await params;
    const filePath = filePathFromSegments(segments);

    const allowedRoots = await getAllowedRoots();
    if (!isPathAllowed(filePath, allowedRoots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Not a file" }, { status: 400 });
    }

    const body = await request.json() as { content?: unknown };
    if (typeof body.content !== "string") {
      return NextResponse.json({ error: "content (string) is required" }, { status: 400 });
    }
    const bytes = Buffer.byteLength(body.content, "utf8");
    if (bytes > TEXT_PREVIEW_MAX_BYTES) {
      return NextResponse.json({ error: `Too large to save (${bytes} bytes)` }, { status: 413 });
    }

    fs.writeFileSync(filePath, body.content, "utf8");
    return NextResponse.json({ success: true, size: bytes });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
