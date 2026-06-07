export type CsvValue = boolean | number | string | null | undefined;

export type CsvColumn<T> = {
  header: string;
  value: (item: T) => CsvValue;
};

const spreadsheetFormulaPattern = /^[\t ]*[=+\-@]/;

function escapeCsvValue(value: CsvValue) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalizedText = String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const text =
    typeof value === "string" && spreadsheetFormulaPattern.test(normalizedText)
      ? `'${normalizedText}`
      : normalizedText;

  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function sanitizeFilename(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "zendora-export.csv"
  );
}

export function buildCsv<T>(columns: CsvColumn<T>[], rows: T[]) {
  return [
    columns.map((column) => escapeCsvValue(column.header)).join(","),
    ...rows.map((row) =>
      columns.map((column) => escapeCsvValue(column.value(row))).join(","),
    ),
  ].join("\n");
}

export function csvResponse<T>(input: {
  columns: CsvColumn<T>[];
  filename: string;
  rows: T[];
}) {
  const filename = sanitizeFilename(input.filename);

  return new Response(buildCsv(input.columns, input.rows), {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
