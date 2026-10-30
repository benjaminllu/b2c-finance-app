/**
 * Minimal RFC 4180 CSV parser: quoted fields, escaped quotes (""), commas and newlines inside quotes,
 * CRLF or LF. Lines starting with `#` (outside quotes) are comments. Returns one object per data row,
 * keyed by the header row. Throws on an unterminated quote.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let lineStart = true;
  let skipLine = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (!skipLine && !(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
    lineStart = true;
    skipLine = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (lineStart && ch === "#") skipLine = true;
    lineStart = false;
    if (skipLine && ch !== "\n") continue;
    if (ch === '"' && field === "") inQuotes = true;
    else if (ch === ",") endField();
    else if (ch === "\n") endRow();
    else if (ch !== "\r") field += ch;
  }
  if (inQuotes) throw new Error("Unterminated quoted field in CSV");
  if (field !== "" || row.length) endRow();

  const [header, ...body] = rows;
  if (!header) return [];
  const names = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(names.map((n, i) => [n, (r[i] ?? "").trim()])));
}
