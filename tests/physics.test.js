import { describe, expect, it } from "vitest";

import { clamp, lerp, reflectValue } from "../src/physics.js";

describe("clamp", () => {
  it("keeps values within bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
  });
});

describe("lerp", () => {
  it("interpolates between values", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 1)).toBe(10);
  });
});

describe("reflectValue", () => {
  it("reflects values inside bounds", () => {
    expect(reflectValue(4, 0, 10)).toBe(4);
  });

  it("reflects values beyond max", () => {
    expect(reflectValue(12, 0, 10)).toBe(8);
    expect(reflectValue(25, 0, 10)).toBe(5);
  });

  it("reflects values below min", () => {
    expect(reflectValue(-2, 0, 10)).toBe(2);
    expect(reflectValue(-15, 0, 10)).toBe(5);
  });

  it("handles degenerate ranges", () => {
    expect(reflectValue(5, 3, 3)).toBe(3);
  });
});
