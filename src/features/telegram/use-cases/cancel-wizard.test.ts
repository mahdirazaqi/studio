import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteWizardState = vi.fn();

vi.mock("@/features/telegram/repository/telegram-repository", () => ({
  deleteWizardState: (...args: unknown[]) => deleteWizardState(...args),
}));

const { cancelWizard } = await import("./cancel-wizard");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cancelWizard", () => {
  it("deletes the wizard row for this telegram user", async () => {
    await cancelWizard("tg-1");
    expect(deleteWizardState).toHaveBeenCalledWith("tg-1");
  });
});
