export function activeJudgeScores(judgeScores, activeJudges) {
  const scores = Array.isArray(judgeScores) ? judgeScores : [];
  const judges = Array.isArray(activeJudges) ? activeJudges : [];
  const active = new Set(judges
    .map((judge) => String(judge?.judgeUuid ?? "").trim().toLowerCase())
    .filter(Boolean));
  return scores.filter((score) => active.has(String(score?.judgeUuid ?? "").trim().toLowerCase()));
}
