import { describe, expect, it } from "vitest";
import { morningBrief, type BriefFacts } from "./index";

const base: BriefFacts = {
  school: "Demo School",
  dateLabel: "Tue 17 Nov",
  collectedYesterdayMinor: 4_137_500,
  paymentsYesterday: 8,
  collectedMonthMinor: 115_985_100,
  recoveredMonthMinor: 15_861_300,
  overdue60Minor: 145_353_600,
  overdue60Families: 40,
  attendancePct: 94,
  classesUnmarked: 6,
  staffAbsent: 2,
  staffLate: 5,
  atRiskNames: ["A", "B", "C", "D"],
  atRiskTotal: 5,
  pendingApprovals: 3,
};

describe("morning brief", () => {
  it("uses only the given numbers", () => {
    const { en } = morningBrief(base);
    expect(en).toContain("Rs 41,375 (8 payments)");
    expect(en).toContain("Rs 158,613");
    expect(en).toContain("from 40 families");
    expect(en).toContain("94%, 6 classes not marked");
    expect(en).toContain("A, B, C and 2 more");
    expect(en).toContain("3 discount requests");
  });
  it("skips lines with nothing to say", () => {
    const { en } = morningBrief({ ...base, recoveredMonthMinor: 0, overdue60Minor: 0, atRiskTotal: 0, pendingApprovals: 0, staffAbsent: 0, staffLate: 0 });
    expect(en).not.toContain("Recovered");
    expect(en).not.toContain("May leave");
    expect(en).not.toContain("discount");
    expect(en).not.toContain("Staff");
  });
  it("has an Urdu version for the voice brief", () => {
    expect(morningBrief(base).ur).toContain("صبح بخیر");
  });
});
