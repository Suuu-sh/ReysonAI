/**
 * Deliberately partial or malformed runtime input for boundary tests.
 * Do not normalize these values: their missing/invalid fields are under test.
 */
export function fixtureValue<T>(value: unknown): T {
  return value as T;
}
