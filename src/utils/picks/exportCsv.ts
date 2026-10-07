import { PICKS_CRITERIA, getPicksGenreLabel } from "@/config/picks";
import { downloadBlob } from "./download";
import type { RankedPhoto } from "./types";

const escapeCell = (value: string | number | null | undefined): string => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function buildRankingCsv(ranked: RankedPhoto[], scoreLabel: string): string {
  const header = [
    "Rank",
    "File",
    scoreLabel,
    ...PICKS_CRITERIA.map((c) => c.label),
    "Genres",
    "Critique",
    "Identical copies",
  ];
  const rows = ranked.map(({ rank, score, photo }) => [
    rank,
    photo.name,
    score.toFixed(2),
    ...PICKS_CRITERIA.map((c) => photo.scores?.[c.key] ?? null),
    (photo.genres ?? []).map(getPicksGenreLabel).join(" / "),
    photo.critique,
    (photo.duplicates ?? []).join(" / "),
  ]);
  return [header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");
}

export function downloadCsv(csv: string, fileName: string): void {
  // The BOM makes Excel read the file as UTF-8 instead of the system codepage.
  downloadBlob(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }), fileName);
}
