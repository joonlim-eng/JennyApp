/**
 * Resolve a vendor sheet "image" cell value into a URL that can be rendered
 * by React Native's <Image>. Handles the common Google Drive share formats:
 *
 *   https://drive.google.com/file/d/<ID>/view?usp=sharing
 *   https://drive.google.com/open?id=<ID>
 *   https://drive.google.com/uc?id=<ID> / uc?export=view&id=<ID>
 *   https://drive.google.com/thumbnail?id=<ID>
 *   =IMAGE("https://...") sheet formulas
 *   bare Drive file IDs
 *
 * Drive share links point at an HTML viewer page, not the image bytes, so
 * they must be converted to the thumbnail endpoint to render in an <Image>.
 * Non-Drive http(s) URLs are passed through unchanged.
 */

const DRIVE_ID_RE = /[-\w]{25,}/;

export function extractDriveFileId(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // /file/d/<id>/...
  const fileMatch = value.match(/\/file\/d\/([-\w]{10,})/);
  if (fileMatch) return fileMatch[1];

  // ?id=<id> or &id=<id>
  const idParam = value.match(/[?&]id=([-\w]{10,})/);
  if (idParam) return idParam[1];

  // bare file ID (no scheme, no spaces, long enough to be a Drive ID)
  if (!/^https?:\/\//i.test(value) && !value.includes(' ')) {
    const bare = value.match(DRIVE_ID_RE);
    if (bare && bare[0] === value) return value;
  }

  return null;
}

export function resolveImageUrl(raw?: string | null, size = 'w400'): string | undefined {
  if (!raw) return undefined;
  let value = String(raw).trim();
  if (!value) return undefined;

  // =IMAGE("url") or =IMAGE(url) sheet formula
  const formula = value.match(/^=IMAGE\(\s*"?([^",)]+)"?/i);
  if (formula) value = formula[1].trim();

  const isDrive = /(^|\/\/)(drive|docs)\.google\.com\//i.test(value);
  const id = extractDriveFileId(value);

  if (id && (isDrive || !/^https?:\/\//i.test(value))) {
    // lh3 serves raw image bytes directly (no redirect) — more reliable in RN <Image>.
    return `https://lh3.googleusercontent.com/d/${id}=${size}`;
  }

  // lh3.googleusercontent.com and other direct image URLs pass through.
  if (/^https?:\/\//i.test(value)) return value;

  return undefined;
}
