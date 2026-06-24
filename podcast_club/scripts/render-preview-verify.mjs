#!/usr/bin/env node

import { spawn } from 'node:child_process';

const requiredEnv = ['PODCAST_CLUB_BASE_URL', 'RENDER_API_KEY', 'RENDER_SERVICE_ID'];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);
const hasLoginCredentials = Boolean(process.env.PODCAST_CLUB_EMAIL && process.env.PODCAST_CLUB_PASSWORD);
const hasSessionCookie = Boolean(process.env.PODCAST_CLUB_SESSION_COOKIE);

if (missingEnv.length > 0 || (!hasLoginCredentials && !hasSessionCookie)) {
  console.error('Missing required verification env vars.');
  if (missingEnv.length > 0) {
    console.error(`Missing: ${missingEnv.join(', ')}`);
  }
  if (!hasLoginCredentials && !hasSessionCookie) {
    console.error('Provide either PODCAST_CLUB_EMAIL/PODCAST_CLUB_PASSWORD or PODCAST_CLUB_SESSION_COOKIE.');
  }
  console.error('');
  console.error('Example:');
  console.error('  PODCAST_CLUB_BASE_URL=https://preview.onrender.com \\');
  console.error('  RENDER_API_KEY=... RENDER_SERVICE_ID=srv-... \\');
  console.error('  PODCAST_CLUB_EMAIL=member@example.com PODCAST_CLUB_PASSWORD=... \\');
  console.error('  npm run verify:render:preview');
  process.exit(1);
}

function envWithDefaults(defaults) {
  const nextEnv = { ...process.env };
  for (const [key, value] of Object.entries(defaults)) {
    if (typeof nextEnv[key] === 'undefined') {
      nextEnv[key] = value;
    }
  }
  return nextEnv;
}

function runStep(name, script, env) {
  return new Promise((resolve, reject) => {
    console.log(`\n== ${name} ==`);

    const child = spawn(process.execPath, [script], {
      env,
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${name} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`));
    });
  });
}

const statusEnv = envWithDefaults({
  RENDER_WAIT: '1',
  RENDER_REQUIRED_STATUS: 'live',
  RENDER_REQUIRE_SHA_MATCH: '1'
});

console.log(`Render target: ${process.env.PODCAST_CLUB_BASE_URL.replace(/\/+$/, '')}`);
await runStep('Render deploy status', 'scripts/render-status.mjs', statusEnv);
await runStep('Podcast Club live save smoke', 'scripts/live-save-flow-smoke.mjs', process.env);

console.log('\nRender preview/staging verification passed.');
