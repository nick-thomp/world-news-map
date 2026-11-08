// Builds data/news.js: news outlets per country, pulled from Wikidata via the free QLever endpoint.
// Run with: node scripts/build-data.mjs
import { writeFile, mkdir } from "node:fs/promises";

const ENDPOINT = "https://qlever.dev/api/wikidata";

// Wikidata "instance of" types -> category shown in the app
const CATEGORIES = {
  Q11032: "Newspaper",       // newspaper
  Q1110794: "Newspaper",     // daily newspaper
  Q2305295: "Newspaper",     // weekly newspaper
  Q1868552: "Newspaper",     // local newspaper
  Q2138556: "Newspaper",     // regional newspaper
  Q106651444: "Newspaper",   // community newspaper
  Q142043: "Newspaper",      // free newspaper
  Q1449648: "Newspaper",     // tabloid
  Q106651372: "Newspaper",   // business newspaper
  Q11313190: "Newspaper",    // sports newspaper
  Q5276122: "Online news",   // digital newspaper
  Q1153191: "Online news",   // online newspaper
  Q17232649: "Online news",  // news website
  Q192283: "News agency",
  Q1684600: "Magazine",      // news magazine
  Q1126006: "Broadcaster",   // public broadcaster
  Q15265344: "Broadcaster",
  Q1616075: "TV station",
};

const query = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?item ?type ?iso ?site ?en ?native ?place ?lang WHERE {
  VALUES ?type { ${Object.keys(CATEGORIES).map((q) => "wd:" + q).join(" ")} }
  ?item wdt:P31 ?type ; wdt:P856 ?site ; wdt:P17 ?c .
  ?c wdt:P299 ?iso .
  MINUS { ?item wdt:P576 ?end }
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item wdt:P1448 ?native }
  OPTIONAL { ?item wdt:P291 ?p . ?p rdfs:label ?place FILTER(LANG(?place) = "en") }
  OPTIONAL { ?item wdt:P407 ?l . ?l rdfs:label ?lang FILTER(LANG(?lang) = "en") }
}`;

// Some outlets list archive/library pages as their website; skip those when a better URL exists.
const ARCHIVE_HOSTS = /kansalliskirjasto|chroniclingamerica|loc\.gov|archive\.org|europeana|trove\.nla|anno\.onb|delpher|gallica|digi\.|digitale|zefys|e-newspaperarchives/i;

function scoreUrl(url) {
  let s = url.length;
  if (ARCHIVE_HOSTS.test(url)) s += 1000;
  if (!url.startsWith("https")) s += 5;
  return s;
}

// Outlets with no English label: grab a label in any language instead.
const fallbackQuery = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?item (SAMPLE(?label) AS ?any) WHERE {
  VALUES ?type { ${Object.keys(CATEGORIES).map((q) => "wd:" + q).join(" ")} }
  ?item wdt:P31 ?type ; wdt:P856 ?site ; rdfs:label ?label .
  MINUS { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
} GROUP BY ?item`;

async function sparql(q) {
  const res = await fetch(ENDPOINT + "?query=" + encodeURIComponent(q), {
    headers: { Accept: "application/sparql-results+json", "User-Agent": "WorldNewsMap/0.1" },
  });
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`);
  return (await res.json()).results.bindings;
}

console.log("Querying Wikidata (QLever)...");
const rows = await sparql(query);
const fallbackNames = new Map(
  (await sparql(fallbackQuery)).map((r) => [r.item.value.split("/").pop(), r.any.value])
);
console.log(`Got ${rows.length} rows, ${fallbackNames.size} non-English names`);

const byItem = new Map();
for (const r of rows) {
  const id = r.item.value.split("/").pop();
  const iso = r.iso.value.padStart(3, "0");
  let o = byItem.get(id);
  if (!o) {
    o = { id, countries: new Set(), urls: new Set(), names: new Set(), cats: new Set(), places: new Set(), langs: new Set(), en: null };
    byItem.set(id, o);
  }
  o.countries.add(iso);
  o.urls.add(r.site.value);
  o.cats.add(CATEGORIES[r.type.value.split("/").pop()]);
  if (r.en) o.en = r.en.value;
  if (r.native) o.names.add(r.native.value);
  if (r.place) o.places.add(r.place.value);
  if (r.lang) o.langs.add(r.lang.value);
}

const CAT_ORDER = Object.values(CATEGORIES).filter((c, i, a) => a.indexOf(c) === i);
const out = {};
for (const o of byItem.values()) {
  const url = [...o.urls].sort((a, b) => scoreUrl(a) - scoreUrl(b))[0];
  if (ARCHIVE_HOSTS.test(url)) continue;
  const name = o.en || [...o.names][0] || fallbackNames.get(o.id);
  if (!name || /^Q\d+$/.test(name)) continue;
  const entry = {
    n: name,
    u: url,
    c: CAT_ORDER.find((c) => o.cats.has(c)),
    q: o.id,
  };
  const native = [...o.names].find((n) => n !== name);
  if (native) entry.nn = native;
  if (o.places.size) entry.p = [...o.places].slice(0, 2).join(", ");
  if (o.langs.size) entry.l = [...o.langs].slice(0, 3).join(", ");
  for (const iso of o.countries) (out[iso] ||= []).push(entry);
}
// News-first ordering: newspapers and news sites before TV stations (many of which are entertainment channels)
for (const list of Object.values(out))
  list.sort((a, b) => CAT_ORDER.indexOf(a.c) - CAT_ORDER.indexOf(b.c) || a.n.localeCompare(b.n));

const total = Object.values(out).reduce((s, l) => s + l.length, 0);
console.log(`${byItem.size} outlets -> ${total} entries across ${Object.keys(out).length} countries`);

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../data/news.js", import.meta.url),
  `// Generated ${new Date().toISOString().slice(0, 10)} from Wikidata (CC0) by scripts/build-data.mjs\n` +
    `window.NEWS_DATA = ${JSON.stringify(out)};\n`
);
console.log("Wrote data/news.js");
