import { isMockedPath } from "./config";
import { createAuthMocks } from "./handlers/auth";

export function createMockHandlers(
  prefixes: readonly string[],
  origin: string,
) {
  return createAuthMocks(origin)
    .filter(({ path }) => isMockedPath(path, prefixes))
    .map(({ handler }) => handler);
}
