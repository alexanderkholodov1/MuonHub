import { readFileSync } from "node:fs";
import { z } from "zod";

const account = z.object({ email: z.email(), password: z.string().min(8), uid: z.string() });
export const StateSchema = z.object({
  owner: account,
  second: account,
  unknownEmail: z.email(),
  station: z.object({ id: z.string(), name: z.string() }),
  privateStation: z.object({ id: z.string(), name: z.string(), city: z.string() }),
  device: z.object({ id: z.string(), label: z.string() }),
  streamId: z.string(),
  minutesEnd: z.number().int(),
});
export type SeedState = z.infer<typeof StateSchema>;
export const stateFile = new URL("./.state/seed.json", import.meta.url);

export function readState(): SeedState {
  return StateSchema.parse(JSON.parse(readFileSync(stateFile, "utf8")));
}
