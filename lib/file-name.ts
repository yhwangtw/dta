// Validation for user-supplied file/folder names (create, rename, upload).
// One segment only — path traversal or separators are rejected outright.

const INVALID_CHARS = /[\/\\\0<>:"|?*]/;

export function validateEntryName(name: string): string | null {
  const n = name.trim();
  if (!n) return "Name is empty";
  if (n === "." || n === "..") return "Invalid name";
  if (INVALID_CHARS.test(n)) return "Name contains invalid characters";
  if (n.length > 255) return "Name is too long";
  return null;
}
