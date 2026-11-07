// ponytail: self-check. Prints every live source and exits 1 on any adapter error.
import { getLive } from "../lib/live";

void (async () => {
  const live = await getLive();
  console.log(JSON.stringify(live, null, 2));
  if (live.errors.length) process.exit(1);
})();
