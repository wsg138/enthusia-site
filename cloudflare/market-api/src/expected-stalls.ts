export const EXPECTED_STALL_IDS = [
  "stall1", "stall10", "stall11", "stall12", "stall13", "stall14", "stall15", "stall16",
  "stall17", "stall18", "stall19", "stall2", "stall20", "stall21", "stall22", "stall23",
  "stall24", "stall25", "stall26", "stall27", "stall28", "stall29", "stall3", "stall30",
  "stall31", "stall32", "stall33", "stall34", "stall35", "stall36", "stall37", "stall38",
  "stall39", "stall4", "stall40", "stall41", "stall42", "stall43", "stall44", "stall45",
  "stall46", "stall47", "stall48", "stall49", "stall5", "stall50", "stall51", "stall52",
  "stall53", "stall54", "stall55", "stall56", "stall57", "stall58", "stall59", "stall6",
  "stall60", "stall61", "stall62", "stall63", "stall64", "stall65", "stall66", "stall67",
  "stall68", "stall69", "stall7", "stall70", "stall71", "stall8", "stall9"
] as const;

export const EXPECTED_STALL_SET = new Set<string>(EXPECTED_STALL_IDS);

export const NATURAL_STALL_IDS = [...EXPECTED_STALL_IDS].sort(
  (a, b) => Number(a.slice(5)) - Number(b.slice(5)),
);
