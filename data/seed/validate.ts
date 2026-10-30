import { z } from "zod";
import { SEED_FILES } from "./index";

// Importing ./index already parses everything; this script reports every issue, not just the first.
let failed = false;
for (const [name, { data, schema }] of Object.entries(SEED_FILES)) {
  const result = z.array(schema as z.ZodType).safeParse(data);
  if (result.success) {
    console.log(`ok   ${name} (${(data as unknown[]).length} records)`);
  } else {
    failed = true;
    console.error(`FAIL ${name}\n${z.prettifyError(result.error)}`);
  }
}
process.exit(failed ? 1 : 0);
