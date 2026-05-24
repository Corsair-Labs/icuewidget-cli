#!/usr/bin/env node

import { main } from "../src-node/cli.js";

main(process.argv).catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
