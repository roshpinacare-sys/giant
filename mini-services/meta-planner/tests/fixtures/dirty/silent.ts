export function handled(): string {
  try {
    return "ok";
  } catch (err) {
  }
  return "ok";
}
export function alsoHandled(): string {
  try {
    return "ok2";
  } catch {
    // swallowed entirely
  }
  return "ok2";
}
