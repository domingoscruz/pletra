import { describe, it, expect } from "vitest";

/**
 * Initial smoke test to verify Vite Plus (vp check) integration.
 */
describe("Pletra Environment Validation", () => {
  it("should verify that the testing environment is correctly configured", () => {
    const appName = "Pletra";
    expect(appName).toBe("Pletra");
  });

  it("should have access to process.env in test mode", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });
});
