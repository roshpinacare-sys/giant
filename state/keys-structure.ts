/* structure-only inspector — never prints values, only shapes */
const a = JSON.parse(await Bun.file("/home/z/.secrets/steem/army-keys.json").text());
function walk(o: unknown, p: string, depth = 0): void {
  if (Array.isArray(o)) {
    console.log(`${p}[]: ${o.length} items`);
    if (o.length && typeof o[0] === "object" && o[0]) {
      console.log(`  item keys: ${Object.keys(o[0] as object).join(",")}`);
      const ids = o.map((x) => (typeof x === "object" && x ? ((x as Record<string, unknown>).account ?? (x as Record<string, unknown>).name ?? (x as Record<string, unknown>).id ?? "?") : "?"));
      console.log(`  identifiers: ${ids.slice(0, 12).join(",")}`);
    }
  } else if (typeof o === "object" && o) {
    for (const k of Object.keys(o as object)) {
      const v = (o as Record<string, unknown>)[k];
      if (typeof v === "object" && v) walk(v, `${p}.${k}`, depth + 1);
      else console.log(`${p}.${k} = <${typeof v}>`);
    }
  } else console.log(`${p} = <${typeof o}>`);
}
walk(a, "army-keys");
