import { describe, expect, it } from "vitest";
import { mergeAdopted } from "../store";
import type { Session } from "../store";

const sess = (id: string): Session => ({
  id, title: id, createdAt: 1, updatedAt: 2, messages: [],
});

describe("guest adoption merge", () => {
  it("adopts guest work into an empty server record", () => {
    expect(mergeAdopted([], [sess("g1")], [])).toEqual([sess("g1")]);
  });

  it("never duplicates sessions present on both sides", () => {
    const merged = mergeAdopted([sess("s1")], [sess("s1"), sess("g2")], [sess("s1")]);
    expect(merged.map((s) => s.id)).toEqual(["s1", "g2"]);
  });

  it("keeps server order first, local-only appended", () => {
    const merged = mergeAdopted([sess("s1")], [], [sess("local")]);
    expect(merged.map((s) => s.id)).toEqual(["s1", "local"]);
  });
});
