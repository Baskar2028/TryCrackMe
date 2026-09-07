import { QUESTIONS } from "../server/src/questions.js";
const counts = Object.groupBy(QUESTIONS, (q) => q.language);
if (QUESTIONS.length !== 13)
  throw new Error(`Expected 13 questions, got ${QUESTIONS.length}`);
if (
  (counts.C || []).length !== 5 ||
  (counts.Python || []).length !== 5 ||
  (counts.Java || []).length !== 3
)
  throw new Error("Language distribution must be C5/Python5/Java3");
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
const max = QUESTIONS.reduce((s, q) => s + q.maxMarks, 0) + (counts.Python || []).length;
if (max !== 295) throw new Error(`Max score should be 295, got ${max}`);
console.log("DATA VALIDATION PASS");
console.log({
  questions: QUESTIONS.length,
  C: counts.C.length,
  Python: counts.Python.length,
  Java: counts.Java.length,
  maxScore: max,
});
