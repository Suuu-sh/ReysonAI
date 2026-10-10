/**
 * The Worker check resolves browser-only modules to declaration-only Worker
 * views. Cloudflare's Body.json() default remains `unknown` for Worker code.
 */
/// <reference path="./src/account/session.worker.ts" />
/// <reference path="./src/estimated/datasets.worker.ts" />
export {};
