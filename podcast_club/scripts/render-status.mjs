#!/usr/bin/env node

const apiKey = process.env.RENDER_API_KEY;
const serviceId = process.env.RENDER_SERVICE_ID;
const apiBase = process.env.RENDER_API_BASE || 'https://api.render.com/v1';

if (!apiKey || !serviceId) {
  console.error('Missing required env vars: RENDER_API_KEY and/or RENDER_SERVICE_ID');
  console.error('Example: RENDER_API_KEY=... RENDER_SERVICE_ID=... npm run render:status');
  process.exit(1);
}

function pickLatestDeploy(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  if (Array.isArray(payload?.deploys)) return payload.deploys[0] || null;
  if (payload?.deploy) return payload.deploy;
  return null;
}

function getDeployCommitSha(deploy) {
  if (!deploy || typeof deploy !== 'object') return null;
  return (
    deploy?.commit?.id ||
    deploy?.commit?.sha ||
    deploy?.commitId ||
    deploy?.commitSHA ||
    deploy?.gitCommitId ||
    deploy?.gitCommitSha ||
    null
  );
}

function shortSha(value) {
  if (!value) return '';
  return String(value).slice(0, 7);
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function run() {
  const endpoint = `${apiBase}/services/${encodeURIComponent(serviceId)}/deploys?limit=1`;
  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    }
  });

  const raw = await res.text();
  const payload = parseJsonSafe(raw);

  if (!res.ok) {
    console.error(`Render API request failed: ${res.status} ${res.statusText}`);
    if (payload?.message) {
      console.error(payload.message);
    } else if (raw) {
      console.error(raw);
    }
    process.exit(1);
  }

  const deploy = pickLatestDeploy(payload);
  if (!deploy) {
    console.error('No deploys found for this Render service.');
    process.exit(1);
  }

  const localSha = process.env.GIT_SHA || (await git('rev-parse HEAD'));
  const deployedSha = getDeployCommitSha(deploy);
  const deployId = deploy.id || deploy.deployId || 'unknown';
  const deployStatus = deploy.status || deploy.state || 'unknown';
  const deployCreatedAt = deploy.createdAt || deploy.created_at || deploy.created || 'unknown';

  console.log(`Service: ${serviceId}`);
  console.log(`Latest deploy id: ${deployId}`);
  console.log(`Latest deploy status: ${deployStatus}`);
  console.log(`Latest deploy created: ${deployCreatedAt}`);
  console.log(`Local HEAD: ${shortSha(localSha)} (${localSha})`);

  if (!deployedSha) {
    console.log('Deployed commit: (not exposed by API payload)');
    console.log('Tip: verify commit in Render dashboard deploy details.');
    return;
  }

  console.log(`Deployed commit: ${shortSha(deployedSha)} (${deployedSha})`);
  console.log(localSha === deployedSha ? 'Result: local HEAD matches deployed commit.' : 'Result: local HEAD differs from deployed commit.');
}

async function git(cmd) {
  const { execSync } = await import('node:child_process');
  return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
