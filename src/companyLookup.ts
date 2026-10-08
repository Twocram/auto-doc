export type PartyInfo = {
  name: string;
  inn: string;
  ogrn: string;
};

type EgrulRow = { n?: string; i?: string; o?: string };

function significantToken(query: string): string {
  const quoted = query.match(/[«"]([^»"]+)[»"]/);
  if (quoted) return quoted[1];
  const words = query.split(/\s+/).filter((w) => w.replace(/\W/g, "").length >= 4);
  return words.sort((a, b) => b.length - a.length)[0] ?? query;
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

async function fetchRows(query: string): Promise<EgrulRow[]> {
  const search = await fetch("https://egrul.nalog.ru", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ query }),
  });
  const { t } = (await search.json()) as { t?: string };
  if (!t) return [];

  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(600);
    try {
      const result = await fetch(`https://egrul.nalog.ru/search-result/${t}`);
      const data = (await result.json()) as { rows?: EgrulRow[] };
      if (data.rows) return data.rows;
    } catch {
      // результат ещё не готов — ждём следующую попытку
    }
  }
  return [];
}

export async function lookupParties(query: string, limit = 5): Promise<PartyInfo[]> {
  const token = significantToken(query).toLowerCase();
  try {
    const rows = await fetchRows(query);
    return rows
      .filter((row) => row.i && row.o && (row.n ?? "").toLowerCase().includes(token))
      .slice(0, limit)
      .map((row) => ({ name: row.n ?? query, inn: row.i!, ogrn: row.o! }));
  } catch {
    return [];
  }
}
