/** An explicitly installed local candidate can be reviewed without publishing data. */
export async function fetchRuntimeGameData(dataUrl, { fetchImpl = fetch, cache = "default" } = {}) {
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(dataUrl.hostname)) {
    const localUrl = new URL("/local-review/game-x-data.json", dataUrl);
    const local = await fetchImpl(localUrl, { cache: "no-store" });
    if (local.ok) return local.json();
    if (local.status !== 404) throw new Error(`Could not load local review game data (${local.status}).`);
  }
  const response = await fetchImpl(dataUrl, { cache });
  if (!response.ok) throw new Error(`Could not load game-x-data.json (${response.status}).`);
  return response.json();
}
