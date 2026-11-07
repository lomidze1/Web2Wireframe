/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import SubHeader from "../ui/components/subHeader/SubHeader";

describe("SubHeader", () => {
  it("renders the three import-method tabs (no Screenshot)", () => {
    const { getByRole, getAllByRole } = render(
      <SubHeader currentTab="web" onTabChange={() => {}} />,
    );
    const labels = getAllByRole("tab").map((t) => t.textContent);
    expect(labels).toEqual(["Web", "Area", "HTML"]);
    for (const label of ["Web", "Area", "HTML"]) {
      expect(getByRole("tab", { name: label })).toBeTruthy();
    }
  });

  it("switches the active tab on click", () => {
    const onTabChange = vi.fn();
    const { getByRole } = render(
      <SubHeader currentTab="web" onTabChange={onTabChange} />,
    );
    fireEvent.click(getByRole("tab", { name: "HTML" }));
    expect(onTabChange).toHaveBeenCalledWith("html");
  });

  it("marks the active tab with aria-selected", () => {
    const { getByRole } = render(
      <SubHeader currentTab="html" onTabChange={() => {}} />,
    );
    expect(
      getByRole("tab", { name: "HTML" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      getByRole("tab", { name: "Web" }).getAttribute("aria-selected"),
    ).toBe("false");
  });
});
