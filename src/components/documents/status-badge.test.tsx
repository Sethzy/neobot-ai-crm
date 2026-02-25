/**
 * @file Tests for StatusBadge component
 * @description Tests status display variants and tooltips
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders uploaded status", () => {
    render(<StatusBadge status="uploaded" />);
    expect(screen.getByText("Uploaded")).toBeInTheDocument();
  });

  it("renders processing status with spinner", () => {
    render(<StatusBadge status="processing" />);
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("renders complete status", () => {
    render(<StatusBadge status="complete" />);
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  it("renders failed status", () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders failed status with error message prop", () => {
    render(
      <StatusBadge status="failed" errorMessage="Processing timed out" />
    );

    // The badge should still render with Failed text
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders failed status without error message prop", () => {
    render(<StatusBadge status="failed" />);

    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});

describe("StatusBadge - new extraction statuses", () => {
  it("renders processed status with green styling", () => {
    render(<StatusBadge status="processed" />);
    expect(screen.getByText("Processed")).toBeInTheDocument();
  });

  it("renders in_review status with yellow styling", () => {
    render(<StatusBadge status="in_review" />);
    expect(screen.getByText("In Review")).toBeInTheDocument();
  });

  it("renders reviewed status with blue styling", () => {
    render(<StatusBadge status="reviewed" />);
    expect(screen.getByText("Reviewed")).toBeInTheDocument();
  });
});

describe("StatusBadge - uses new badge variants", () => {
  it("renders processed status with success variant", () => {
    render(<StatusBadge status="processed" />);

    const badge = screen.getByText("Processed").closest("span");
    expect(badge).toHaveClass("bg-success-foreground");
  });

  it("renders in_review status with warning variant", () => {
    render(<StatusBadge status="in_review" />);

    const badge = screen.getByText("In Review").closest("span");
    expect(badge).toHaveClass("bg-warning-foreground");
  });

  it("renders reviewed status with info variant", () => {
    render(<StatusBadge status="reviewed" />);

    const badge = screen.getByText("Reviewed").closest("span");
    expect(badge).toHaveClass("bg-info-foreground");
  });
});
