#!/usr/bin/env node

import { run } from '@oclif/core';

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
