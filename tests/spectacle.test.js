import { describe, expect, it } from "vitest";

import { getComboTier, getGoalSplashFrame, getTempoGainBoost } from "../src/spectacle.js";

describe("getComboTier", () => {
  it("returns tiers at thresholds", () => {
    expect(getComboTier(0)).toBe(0);
    expect(getComboTier(5)).toBe(1);
    expect(getComboTier(10)).toBe(2);
    expect(getComboTier(15)).toBe(3);
    expect(getComboTier(20)).toBe(4);
  });
});

describe("getTempoGainBoost", () => {
  it("scales gain between 0.8 and 1.4", () => {
    expect(getTempoGainBoost(0)).toBeCloseTo(0.8, 5);
    expect(getTempoGainBoost(100)).toBeCloseTo(1.4, 5);
  });

  it("clamps values outside range", () => {
    expect(getTempoGainBoost(-10)).toBeCloseTo(0.8, 5);
    expect(getTempoGainBoost(200)).toBeCloseTo(1.4, 5);
  });
});

describe("getGoalSplashFrame", () => {
  it("returns zero alpha when timer is done", () => {
    expect(getGoalSplashFrame(0, 42)).toEqual({ alpha: 0, scale: 1 });
  });

  it("returns expected alpha and scale at start", () => {
    const frame = getGoalSplashFrame(42, 42);
    expect(frame.alpha).toBe(1);
    expect(frame.scale).toBeCloseTo(1, 5);
  });

  it("returns expected alpha mid-way", () => {
    const frame = getGoalSplashFrame(21, 42);
    expect(frame.alpha).toBeCloseTo(1, 5);
    expect(frame.scale).toBeCloseTo(1.04, 2);
  });
});
