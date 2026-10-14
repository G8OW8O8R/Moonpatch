import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { productsIn } from "@/lib/products";
import { ROOM_IDS } from "@/lib/rooms";

const share = z.number().min(0).max(1);
const body = z.strictObject({
  room: z.enum(ROOM_IDS),
  hotspots: z.record(z.string(), z.tuple([share, share])),
});

/** Writes a room's seeds into its content file, leaving the rest of the file as it is. Development only. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const { room, hotspots } = parsed.data;
  const ids = productsIn(room).map((p) => p.id);
  if (Object.keys(hotspots).sort().join() !== [...ids].sort().join()) {
    return Response.json({ error: "Every product of the room needs exactly one seed" }, { status: 400 });
  }
  const file = join(process.cwd(), "content", "rooms", `${room}.json`);
  const source = await readFile(file, "utf8");
  const lines = ids.map((id) => `    "${id}": [${hotspots[id]![0]}, ${hotspots[id]![1]}]`);
  const block = `"hotspots": {\n${lines.join(",\n")}\n  }`;
  if (!/"hotspots": \{[^}]*\}/.test(source)) return Response.json({ error: "No seeds in the room file" }, { status: 500 });
  await writeFile(file, source.replace(/"hotspots": \{[^}]*\}/, block));
  return Response.json({ ok: true });
}
