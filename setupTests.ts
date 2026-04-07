import "@testing-library/jest-dom";
import { expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extends Vitest with jest-dom matchers
expect.extend(matchers);

// Runs a cleanup after each test case to prevent memory leaks
afterEach(() => {
  cleanup();
});
