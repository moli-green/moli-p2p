export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// Helper to wrap a Promise that might reject
export const wrapPromise = async <T, E = Error>(
  promise: Promise<T>
): Promise<Result<T, E>> => {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    return err(error as E);
  }
};
