// The composed project includes browser modules whose untyped Fetch JSON calls
// follow the DOM default. Keep that default local to this mixed Worker check.
declare global {
  interface Body {
    json<T = any>(): Promise<T>;
  }
}

export {};
