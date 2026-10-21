import { createStore, StateTransaction } from "../src/store";

export function createMemoryStore() {
  let values = new Map<string, unknown>();
  let pending: Promise<unknown> = Promise.resolve();
  return createStore({
    transaction<T>(operation: (txn: StateTransaction) => Promise<T>): Promise<T> {
      const result = pending.then(async () => {
        const next = structuredClone(values);
        const output = await operation({
          async get<T>(key: string) { return structuredClone(next.get(key)) as T | undefined; },
          async put<T>(key: string, value: T) { next.set(key, structuredClone(value)); },
        });
        values = next;
        return output;
      });
      pending = result.catch(() => {});
      return result;
    },
  });
}
