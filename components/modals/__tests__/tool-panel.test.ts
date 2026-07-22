import { describe, expect, it } from "vitest";
import { PRESET_DEFAULT, PRESET_FULL, PRESET_NONE, getPresetFromTools } from "../ToolPanel";

describe("tool presets", () => {
  it("keeps ask_user available whenever tools are enabled", () => {
    expect(PRESET_NONE).toEqual([]);
    expect(PRESET_DEFAULT).toContain("ask_user");
    expect(PRESET_FULL).toContain("ask_user");
    expect(getPresetFromTools(PRESET_DEFAULT.map((name) => ({ name, description: "", active: true })))).toBe("default");
  });
});
