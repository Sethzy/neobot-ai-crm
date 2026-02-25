/**
 * Tests for localStorage persistence hook.
 * @module hooks/use-local-storage.test
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "./use-local-storage";

describe("useLocalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns initial value when localStorage is empty", () => {
    const { result } = renderHook(() =>
      useLocalStorage("test-key", { foo: "bar" })
    );

    expect(result.current[0]).toEqual({ foo: "bar" });
  });

  it("returns stored value when localStorage has data", () => {
    localStorage.setItem("test-key", JSON.stringify({ foo: "stored" }));

    const { result } = renderHook(() =>
      useLocalStorage("test-key", { foo: "default" })
    );

    expect(result.current[0]).toEqual({ foo: "stored" });
  });

  it("updates localStorage when setValue called", () => {
    const { result } = renderHook(() =>
      useLocalStorage("test-key", { count: 0 })
    );

    act(() => {
      result.current[1]({ count: 42 });
    });

    expect(result.current[0]).toEqual({ count: 42 });
    expect(JSON.parse(localStorage.getItem("test-key")!)).toEqual({ count: 42 });
  });

  it("handles invalid JSON in localStorage gracefully", () => {
    localStorage.setItem("test-key", "not-valid-json");

    const { result } = renderHook(() =>
      useLocalStorage("test-key", { fallback: true })
    );

    expect(result.current[0]).toEqual({ fallback: true });
  });
});
