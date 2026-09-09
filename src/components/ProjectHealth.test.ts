import { describe, expect, it } from "vitest";
import { hasCompleteSchedule, scheduleCoverageOf } from "./ProjectHealth";

const completeSchedule = {
  plannedStartTime: "2026-08-07T09:00:00+08:00",
  plannedEndTime: "2026-08-07T11:00:00+08:00",
  estimatedHours: 2,
  sprintId: "sprint-1",
  sprintName: "1.0.0",
};

describe("schedule coverage", () => {
  it("requires start, end, positive estimated hours, and a sprint", () => {
    expect(hasCompleteSchedule(completeSchedule)).toBe(true);
    expect(hasCompleteSchedule({ ...completeSchedule, plannedStartTime: null })).toBe(false);
    expect(hasCompleteSchedule({ ...completeSchedule, plannedEndTime: null })).toBe(false);
    expect(hasCompleteSchedule({ ...completeSchedule, estimatedHours: 0 })).toBe(false);
    expect(hasCompleteSchedule({ ...completeSchedule, sprintId: null, sprintName: null })).toBe(false);
  });

  it("calculates coverage from fully scheduled workitems", () => {
    expect(scheduleCoverageOf([])).toBe(0);
    expect(scheduleCoverageOf([
      completeSchedule,
      { ...completeSchedule, plannedStartTime: null },
      { ...completeSchedule, plannedEndTime: null },
      { ...completeSchedule, estimatedHours: null },
    ])).toBe(25);
  });
});
