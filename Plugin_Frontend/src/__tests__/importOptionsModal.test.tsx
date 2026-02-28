import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import ImportOptionsModal from "../ui/components/modalPopup/ImportOptionsModal";
import { createMockConfigContext } from "./helpers/configMock";

// Mock CSS module
vi.mock("../ui/components/modalPopup/Modal.css", () => ({
  default: new Proxy(
    {},
    { get: (_target, prop) => (typeof prop === "string" ? prop : "") }
  ),
}));

// Mock useConfig while preserving real exports
const mockContext = createMockConfigContext();
vi.mock("../ui/shared/ConfigContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/ConfigContext")>();
  return {
    ...actual,
    useConfig: () => mockContext,
  };
});

describe("ImportOptionsModal", () => {
  const defaultProps = {
    isOpen: true,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    sourceUrl: "https://example.com",
    hasCssVariables: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.config = { ...mockContext.config, showImportOptions: true };
    mockContext.updateConfig = vi.fn();
  });

  it("renders when isOpen is true", () => {
    const { getByText } = render(<ImportOptionsModal {...defaultProps} />);
    expect(getByText("Import Options")).toBeTruthy();
  });

  it("does not render when isOpen is false", () => {
    const { queryByText } = render(
      <ImportOptionsModal {...defaultProps} isOpen={false} />
    );
    expect(queryByText("Import Options")).toBeNull();
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    const { getByText } = render(
      <ImportOptionsModal {...defaultProps} onCancel={onCancel} />
    );

    fireEvent.click(getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onConfirm with options when Import is clicked", () => {
    const onConfirm = vi.fn();
    const { getByText } = render(
      <ImportOptionsModal {...defaultProps} onConfirm={onConfirm} />
    );

    fireEvent.click(getByText("Import"));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        colorMode: expect.any(String),
        fontMode: expect.any(String),
        textMode: expect.any(String),
        layoutMode: expect.any(String),
      })
    );
  });

  it("saves showImportOptions:false on Cancel when 'Don't show again' is checked", () => {
    const { getByText, container } = render(
      <ImportOptionsModal {...defaultProps} />
    );

    // Find the toggle checkbox
    const checkbox = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    expect(checkbox).toBeTruthy();

    // Check the toggle
    fireEvent.change(checkbox, { target: { checked: true } });

    // Click Cancel
    fireEvent.click(getByText("Cancel"));

    expect(mockContext.updateConfig).toHaveBeenCalledWith({
      showImportOptions: false,
    });
  });

  it("does NOT call updateConfig on Cancel when 'Don't show again' is unchecked", () => {
    const { getByText } = render(
      <ImportOptionsModal {...defaultProps} />
    );

    // Don't check the toggle, just click Cancel
    fireEvent.click(getByText("Cancel"));

    expect(mockContext.updateConfig).not.toHaveBeenCalled();
  });

  it("saves all options on Import when 'Don't show again' is checked", () => {
    const { getByText, container } = render(
      <ImportOptionsModal {...defaultProps} />
    );

    // Check the toggle
    const checkbox = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    fireEvent.change(checkbox, { target: { checked: true } });

    // Click Import
    fireEvent.click(getByText("Import"));

    expect(mockContext.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        showImportOptions: false,
        colorMode: expect.any(String),
        fontMode: expect.any(String),
        textMode: expect.any(String),
      })
    );
  });

  it("shows hint text when 'Don't show again' is checked", () => {
    const { container } = render(
      <ImportOptionsModal {...defaultProps} />
    );

    // Check the toggle
    const checkbox = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    fireEvent.change(checkbox, { target: { checked: true } });

    // Hint text should contain restore info
    const hint = container.querySelector(".dontShowAgainHint");
    expect(hint).toBeTruthy();
    expect(hint?.textContent).toContain("Restore anytime from Config");
  });

  it("displays source URL", () => {
    const { container } = render(
      <ImportOptionsModal
        {...defaultProps}
        sourceUrl="https://example.com/test"
      />
    );

    expect(container.textContent).toContain("example.com/test");
  });

  it("shows CSS Variables dropdown when hasCssVariables is true", () => {
    const { getByText } = render(
      <ImportOptionsModal {...defaultProps} hasCssVariables={true} />
    );

    expect(getByText("CSS Variables")).toBeTruthy();
  });

  it("hides CSS Variables dropdown when hasCssVariables is false", () => {
    const { queryByText } = render(
      <ImportOptionsModal {...defaultProps} hasCssVariables={false} />
    );

    expect(queryByText("CSS Variables")).toBeNull();
  });
});
