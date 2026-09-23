import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { run } from "axe-core";
import Auth from "../Auth";

describe("accessibility", () => {
  it("auth page has no axe violations", async () => {
    const { container } = render(<Auth onAuth={() => {}} onGuest={() => {}} />);
    const results = await run(container);
    expect(results.violations).toEqual([]);
  });
});
