import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MUSIC_CONFIG_PATH = path.resolve(process.cwd(), "config/music.json");

function loadMusicConfig() {
  const raw = fs.readFileSync(MUSIC_CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

function isBinaryStep(value) {
  return value === 0 || value === 1;
}

describe("music config", () => {
  it("loads and contains a non-empty songs list", () => {
    const config = loadMusicConfig();
    expect(Array.isArray(config.songs)).toBe(true);
    expect(config.songs.length).toBeGreaterThanOrEqual(10);
  });

  it("has unique song ids and labels", () => {
    const { songs } = loadMusicConfig();
    const ids = songs.map((song) => song.id);
    const labels = songs.map((song) => song.label);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps songs in a fast tempo range", () => {
    const { songs } = loadMusicConfig();

    songs.forEach((song) => {
      expect(typeof song.bpm).toBe("number");
      expect(song.bpm).toBeGreaterThanOrEqual(170);
      expect(song.bpm).toBeLessThanOrEqual(210);
    });
  });

  it("references only declared sections from sectionOrder", () => {
    const { songs } = loadMusicConfig();

    songs.forEach((song) => {
      const sectionNames = Object.keys(song.sections || {});
      expect(sectionNames.length).toBeGreaterThan(0);

      song.sectionOrder.forEach((sectionKey) => {
        expect(sectionNames).toContain(sectionKey);
      });
    });
  });

  it("uses valid core sequence arrays and step shapes", () => {
    const { songs } = loadMusicConfig();
    const melodicKeys = ["lead", "arp", "counter", "bass"];
    const drumKeys = ["kick", "hat", "snare"];

    songs.forEach((song) => {
      expect(Array.isArray(song.scale)).toBe(true);
      expect(song.scale.length).toBeGreaterThanOrEqual(5);
      expect(song.scale.length).toBeLessThanOrEqual(8);

      expect(Array.isArray(song.progression)).toBe(true);
      expect(song.progression.length).toBeGreaterThanOrEqual(4);

      expect(typeof song.variationEveryBars).toBe("number");
      expect(song.variationEveryBars).toBeGreaterThan(0);

      Object.values(song.sections).forEach((section) => {
        melodicKeys.forEach((key) => {
          expect(Array.isArray(section[key])).toBe(true);
          expect(section[key].length).toBe(16);
          section[key].forEach((step) => {
            const valid = step === null || typeof step === "number";
            expect(valid).toBe(true);
          });
        });

        drumKeys.forEach((key) => {
          expect(Array.isArray(section[key])).toBe(true);
          expect(section[key].length).toBe(16);
          section[key].forEach((step) => {
            expect(isBinaryStep(step)).toBe(true);
          });
        });
      });
    });
  });
});
