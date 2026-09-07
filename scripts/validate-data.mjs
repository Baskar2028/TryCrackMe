import { QUESTIONS } from "../server/src/questions.js";
const counts = Object.groupBy(QUESTIONS, (q) => q.language);
if (QUESTIONS.length !== 25)
  throw new Error(`Expected 25 questions, got ${QUESTIONS.length}`);
if (
  (counts.C || []).length !== 10 ||
  (counts.Python || []).length !== 10 ||
  (counts.Java || []).length !== 5
)
  throw new Error("Language distribution must be C10/Python10/Java5");
for (const q of QUESTIONS) {
  if (
    !q.id ||
    !q.title ||
    !q.starterCode ||
    !q.publicTests?.length ||
    !q.hiddenTests?.length
  )
    throw new Error(`Incomplete ${q.id}`);
  if (q.language === "C" && q.bugs.length !== 6)
    throw new Error(`C question ${q.id} must have exactly 6 bug records`);
}
const max = QUESTIONS.reduce((s, q) => s + q.maxMarks, 0) + 10;
if (max !== 560) throw new Error(`Max score should be 560, got ${max}`);
console.log("DATA VALIDATION PASS");
console.log({
  questions: QUESTIONS.length,
  C: counts.C.length,
  Python: counts.Python.length,
  Java: counts.Java.length,
  maxScore: max,
});
