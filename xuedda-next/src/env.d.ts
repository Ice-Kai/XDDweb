/// <reference path="../.astro/types.d.ts" />

import type { AdminSession } from './lib/auth';

declare global {
  namespace App {
    interface Locals {
      admin: AdminSession | null;
    }
  }
}

export {};
