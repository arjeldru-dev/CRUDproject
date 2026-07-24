#!/usr/bin/env node
/**
 * Backend test runner.
 *
 * The backend test suite follows the project convention of self-contained
 * assertion scripts (no jest/vitest): each `*.test.ts` under `src/**\/__tests__`
 * uses `node:assert` (+ `fast-check` for property tests) and exits non-zero on
 * failure. Integration tests inject an in-memory Prisma double via the require
 * cache, so the whole suite runs WITHOUT a live database.
 *
 * This runner discovers every test file and executes each in its OWN Node
 * process via `ts-node/register/transpile-only` (type-checking is handled
 * separately by `npm run typecheck`). A per-file process is required because the
 * integration tests monkeypatch the shared Prisma singleton and call
 * `process.exit` — so they must not share a process. Files run with bounded
 * parallelism to keep wall-clock time practical; each child's output is buffered
 * and printed on completion so parallel logs never interleave.
 *
 *   Usage:  npm test              # run all test files
 *           npm test -- <substr>  # run only files whose path contains <substr>
 */
'use strict';

const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const filter = process.argv[2];
const CONCURRENCY = Math.max(2, Math.min(3, os.cpus().length || 2));
const MAX_SPAWN_ATTEMPTS = 3;

/** Recursively collect every `*.test.ts` file under `dir`. */
function findTestFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findTestFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run one test file in its own process, buffering output. Windows can throw a
 * transient `spawn UNKNOWN` under parallel spawns; retry a few times with a
 * short backoff before giving up so a flaky spawn is not reported as a test
 * failure.
 */
async function runOne(file) {
  for (let attempt = 1; attempt <= MAX_SPAWN_ATTEMPTS; attempt++) {
    const result = await new Promise((resolve) => {
      let settled = false;
      const finish = (code, out) => {
        if (settled) return;
        settled = true;
        resolve({ code, out });
      };
      let child;
      try {
        child = spawn(
          process.execPath,
          ['-r', 'ts-node/register/transpile-only', file],
          { cwd: ROOT, env: process.env },
        );
      } catch (err) {
        return finish(null, `spawn threw: ${err.message}`);
      }
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (out += d));
      child.on('error', (err) => finish(null, `${out}\nspawn error: ${err.message}`));
      child.on('close', (code) => finish(code ?? 1, out));
    });

    // `code === null` marks a spawn failure (never started) — retry.
    if (result.code !== null) return { file, code: result.code, out: result.out };
    if (attempt < MAX_SPAWN_ATTEMPTS) await delay(300 * attempt);
    else return { file, code: 1, out: result.out };
  }
  return { file, code: 1, out: 'unreachable' };
}

async function main() {
  let files = findTestFiles(SRC).sort();
  if (filter) files = files.filter((f) => f.includes(filter));

  if (files.length === 0) {
    console.log(filter ? `No test files match "${filter}".` : 'No test files found.');
    return 0;
  }

  const queue = [...files];
  const failed = [];
  let done = 0;

  async function worker() {
    while (queue.length > 0) {
      const file = queue.shift();
      const rel = path.relative(ROOT, file);
      const { code, out } = await runOne(file);
      done++;
      const mark = code === 0 ? '\u2713' : '\u2717';
      const summary = (out.trim().split('\n').filter(Boolean).pop() || '').trim();
      console.log(`${mark} [${done}/${files.length}] ${rel}  ${summary}`);
      if (code !== 0) {
        failed.push(rel);
        console.log(out.trimEnd());
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

  console.log(`\n${'='.repeat(64)}`);
  console.log(
    `Test files: ${files.length}  |  passed: ${files.length - failed.length}  |  failed: ${failed.length}`,
  );
  if (failed.length > 0) {
    console.log('\nFailed files:');
    failed.forEach((f) => console.log(`  - ${f}`));
    return 1;
  }
  console.log('All test files passed.');
  return 0;
}

main().then((code) => process.exit(code));
