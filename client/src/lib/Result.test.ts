import { describe, it, expect } from "bun:test";
import { wrapPromise } from "./Result";

describe("wrapPromise", () => {
  it("should return ok result when promise resolves successfully", async () => {
    const value = "success value";
    const promise = Promise.resolve(value);

    const result = await wrapPromise(promise);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(value);
    }
  });

  it("should return err result when promise rejects with an Error", async () => {
    const errorMessage = "something went wrong";
    const error = new Error(errorMessage);
    const promise = Promise.reject(error);

    const result = await wrapPromise(promise);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(error);
      expect(result.error.message).toBe(errorMessage);
    }
  });

  it("should return err result when promise rejects with a non-Error value", async () => {
    const thrownValue = "string error";
    const promise = Promise.reject(thrownValue);

    const result = await wrapPromise(promise);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error as any).toBe(thrownValue);
    }
  });
});
