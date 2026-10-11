import { visibleWidth } from "@oh-my-pi/pi-tui";
import { it, expect } from "vitest";
it("imports pi-tui", () => { expect(visibleWidth("abc")).toBe(3); });
