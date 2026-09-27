// Rejection sampling avoids bias when mapping random bytes to six faces.
export function randomDieFace(sides, cryptoSource = globalThis.crypto) {
  if (sides !== 2 && sides !== 6) throw new Error("Only d6 dice and coins are supported.");
  const limit = Math.floor(256 / sides) * sides;
  const bytes = new Uint8Array(1);
  do { cryptoSource.getRandomValues(bytes); } while (bytes[0] >= limit);
  return 1 + bytes[0] % sides;
}
