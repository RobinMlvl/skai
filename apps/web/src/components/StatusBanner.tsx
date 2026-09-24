import type { SearchDetail } from "@skai/core";

export function StatusBanner({ detail }: { detail: SearchDetail }) {
  const { status, error, stats } = detail.search;
  const warnings = stats?.warnings ?? [];
  const lines: { tone: "bad" | "warn"; text: string }[] = [];
  if (status === "blocked" || status === "failed") lines.push({ tone: "bad", text: error ?? "The scan failed." });
  if (status === "cancelled") lines.push({ tone: "warn", text: "Scan cancelled." });
  if (status === "partial" && stats) lines.push({ tone: "warn", text: `Missing dates: ${stats.datesMissing.join(", ")}` });
  for (const warning of warnings) lines.push({ tone: "warn", text: warning });
  if (lines.length === 0) return null;
  return (
    <div role="status">
      {lines.map((line) => (
        <div key={line.text} className={`banner ${line.tone}`}>
          {line.text}
        </div>
      ))}
    </div>
  );
}
