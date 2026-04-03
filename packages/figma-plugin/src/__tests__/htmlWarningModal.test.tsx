import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import HtmlWarningModal from "../ui/components/modalPopup/HtmlWarningModal";

describe("HtmlWarningModal", () => {
  const defaultProps = {
    isOpen: true,
    errorCount: 3,
    errors: [
      "Unclosed tag: <div>",
      "Unclosed tag: <p>",
      "Tag mismatch: expected </span>, found </div>",
    ],
    onContinue: vi.fn(),
    onCancel: vi.fn(),
  };

  describe("visibility", () => {
    it("returns null when isOpen is false", () => {
      const { container } = render(
        <HtmlWarningModal {...defaultProps} isOpen={false} />
      );
      expect(container.innerHTML).toBe("");
    });

    it("renders modal when isOpen is true", () => {
      const { container } = render(<HtmlWarningModal {...defaultProps} />);
      expect(container.innerHTML).not.toBe("");
    });
  });

  describe("content", () => {
    it("displays error count in description", () => {
      const { container } = render(<HtmlWarningModal {...defaultProps} />);
      const text = container.textContent || "";
      expect(text).toContain("3");
    });

    it("displays error messages", () => {
      const { getByText } = render(<HtmlWarningModal {...defaultProps} />);
      expect(getByText("Unclosed tag: <div>")).toBeTruthy();
      expect(getByText("Unclosed tag: <p>")).toBeTruthy();
    });

    it("shows max 5 errors and '+N more' for additional", () => {
      const manyErrors = Array.from({ length: 8 }, (_, i) => `Error ${i + 1}`);
      const { container } = render(
        <HtmlWarningModal
          {...defaultProps}
          errorCount={8}
          errors={manyErrors}
        />
      );
      const text = container.textContent || "";
      // Should show first 5 errors
      expect(text).toContain("Error 1");
      expect(text).toContain("Error 5");
      // Should show "+3 more" hint
      expect(text).toContain("+3 more");
      // Should NOT show error 6-8 directly
      expect(text).not.toContain("Error 6");
    });

    it("shows all errors when 5 or fewer", () => {
      const { container } = render(<HtmlWarningModal {...defaultProps} />);
      const text = container.textContent || "";
      expect(text).not.toContain("more");
    });

    it("displays default header title", () => {
      const { container } = render(<HtmlWarningModal {...defaultProps} />);
      const text = container.textContent || "";
      expect(text).toContain("HTML Quality Warning");
    });

    it("displays custom title when title prop is provided", () => {
      const { container } = render(
        <HtmlWarningModal {...defaultProps} title="Missing CSS" />
      );
      const text = container.textContent || "";
      expect(text).toContain("Missing CSS");
      expect(text).not.toContain("HTML Quality Warning");
    });
  });

  describe("buttons", () => {
    it("renders Go Back button", () => {
      const { getByText } = render(<HtmlWarningModal {...defaultProps} />);
      expect(getByText("Go Back")).toBeTruthy();
    });

    it("renders Continue Anyway button", () => {
      const { getByText } = render(<HtmlWarningModal {...defaultProps} />);
      expect(getByText("Continue Anyway")).toBeTruthy();
    });

    it("calls onCancel when Go Back is clicked", () => {
      const onCancel = vi.fn();
      const { getByText } = render(
        <HtmlWarningModal {...defaultProps} onCancel={onCancel} />
      );
      fireEvent.click(getByText("Go Back"));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("calls onContinue when Continue Anyway is clicked", () => {
      const onContinue = vi.fn();
      const { getByText } = render(
        <HtmlWarningModal {...defaultProps} onContinue={onContinue} />
      );
      fireEvent.click(getByText("Continue Anyway"));
      expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it("calls onCancel when close button (x) is clicked", () => {
      const onCancel = vi.fn();
      const { container } = render(
        <HtmlWarningModal {...defaultProps} onCancel={onCancel} />
      );
      // Find close button by title or by × content
      const closeBtn = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent?.includes("×") || btn.title === "Close"
      );
      expect(closeBtn).toBeTruthy();
      fireEvent.click(closeBtn!);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("edge cases", () => {
    it("handles single error", () => {
      const { container } = render(
        <HtmlWarningModal
          {...defaultProps}
          errorCount={1}
          errors={["Unclosed tag: <div>"]}
        />
      );
      const text = container.textContent || "";
      expect(text).toContain("1");
      expect(text).toContain("Unclosed tag: <div>");
    });

    it("handles empty errors array", () => {
      const { container } = render(
        <HtmlWarningModal
          {...defaultProps}
          errorCount={0}
          errors={[]}
        />
      );
      expect(container.innerHTML).not.toBe("");
    });
  });
});
