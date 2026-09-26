const assert = require("node:assert/strict");
const test = require("node:test");

process.env.YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "test-key";

const youtube = require("../scripts/enrich-youtube")._test;

function group(nome = "Game Test - PS5 Mídia Digital") {
  return {
    key: "game-test",
    representative: { id: "game-test-ps5", nome, plataforma: "PlayStation 5" },
    items: [
      {
        file: "ps5.json",
        product: { id: "game-test-ps5", nome, plataforma: "PlayStation 5" }
      }
    ]
  };
}

test("YouTube 429 é detectado e propagado sem retries agressivos", async () => {
  const error = new Error("rate limited");
  error.response = { status: 429 };
  let calls = 0;

  await assert.rejects(
    () => youtube.findOfficialTrailer(group(), "Game Test", {
      searchTrailerCandidates: async () => {
        calls += 1;
        throw error;
      },
      videoDetails: async () => new Map()
    }),
    (thrown) => {
      assert.equal(youtube.isRateLimitError(thrown), true);
      assert.equal(thrown.searchRequests, 1);
      return true;
    }
  );

  assert.equal(calls, 1);
});

test("produtos sem resultado entram em cooldown progressivo", () => {
  const first = youtube.makeNotFoundProgressEntry(null, "Game Test trailer oficial", "2026-09-26T00:00:00.000Z");
  assert.equal(first.status, "not-found");
  assert.equal(first.attempts, 1);
  assert.equal(first.nextRetryAt, "2026-10-03T00:00:00.000Z");
  assert.equal(youtube.isNotFoundInCooldown(first, new Date("2026-09-27T00:00:00.000Z")), true);
  assert.equal(youtube.isNotFoundInCooldown(first, new Date("2026-10-04T00:00:00.000Z")), false);

  const second = youtube.makeNotFoundProgressEntry(first, first.query, "2026-10-04T00:00:00.000Z");
  assert.equal(second.attempts, 2);
  assert.equal(second.nextRetryAt, "2026-10-18T00:00:00.000Z");
});

test("busca de trailer evita repetir query já usada e conta buscas reais", async () => {
  const seenQueries = new Set(["Game Test PS5 trailer oficial"]);
  const queries = [];
  const result = await youtube.findOfficialTrailer(group(), "Game Test", {
    seenQueries,
    searchTrailerCandidates: async (query) => {
      queries.push(query);
      return [];
    },
    videoDetails: async () => new Map()
  });

  assert.deepEqual(queries, ["Game Test trailer oficial", "Game Test official trailer"]);
  assert.equal(result.searchRequests, 2);
  assert.equal(result.status, "not-found");
  assert.equal(result.trailer, null);
});
