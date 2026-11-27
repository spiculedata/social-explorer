// Acceptance check for issue #382: containers must not run as root, third-party images must be
// digest-pinned, the etl/ and wavepulse/ build contexts need a .dockerignore, and the Python
// images must install from a lock file.
//
// Static verification, run as `node acceptance/382/check.mjs` from the repository root (the
// spec's command). Exit 0 = pass. No Docker needed: the Images workflow
// (.github/workflows/images.yml) builds the images on every change, which is the smoke check.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

// Resolve the repository root whether the process is started from the repo root, the spec
// directory or anywhere inside it.
let root = dirname(fileURLToPath(import.meta.url));
while (root !== '/' && !existsSync(join(root, 'ex-accell-ui', 'Dockerfile'))) {
  root = dirname(root);
}

// C1: the runtime (final) stage of each image's Dockerfile sets a non-root USER before CMD.
const runtimeStageOf = (dockerfile) => {
  const stages = dockerfile.split(/^FROM\b/m).filter((stage) => stage.trim().length > 0);
  return stages[stages.length - 1];
};
const nonRootRuntime = (name, dockerfile) => {
  const runtime = runtimeStageOf(dockerfile);
  const users = [...runtime.matchAll(/^USER\s+(\S+)/gm)].map((m) => m[1]);
  const last = users[users.length - 1];
  check(users.length > 0, `${name}: runtime stage declares no USER (runs as root)`);
  check(
    !!last && last.toLowerCase() !== 'root' && last !== '0',
    `${name}: runtime stage runs as "${last ?? 'root'}" (expected a non-root user)`,
  );
  const cmdIndex = runtime.search(/^CMD/m);
  const userIndex = runtime.search(/^USER/m);
  check(
    cmdIndex > -1 && userIndex > -1 && userIndex < cmdIndex,
    `${name}: USER must apply to the runtime CMD`,
  );
};

for (const name of ['etl', 'wavepulse', 'ex-accell-ui']) {
  const path = join(root, name, 'Dockerfile');
  check(existsSync(path), `${name}/Dockerfile not found`);
  if (existsSync(path)) nonRootRuntime(name, readFileSync(path, 'utf8'));
}

// C1 (smoke check): the Images workflow builds the ETL, WavePulse and UI images.
const imagesYml = readFileSync(join(root, '.github/workflows/images.yml'), 'utf8');
for (const step of ['Build ETL image', 'Build WavePulse image', 'Build UI image']) {
  check(imagesYml.includes(step), `images.yml has no "${step}" step`);
}

// C2: etl/ and wavepulse/ have a .dockerignore excluding data/ and .env*.
for (const name of ['etl', 'wavepulse']) {
  const path = join(root, name, '.dockerignore');
  check(existsSync(path), `${name}/.dockerignore missing`);
  if (!existsSync(path)) continue;
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  const covers = (pattern) => lines.some((line) => line === pattern || line.startsWith(pattern));
  check(covers('data/'), `${name}/.dockerignore does not exclude data/`);
  check(
    lines.some((line) => line.includes('.env')),
    `${name}/.dockerignore does not exclude .env files`,
  );
}

// C3: every third-party registry image in docker-compose.yml is digest-pinned. Local build
// references (${REGISTRY:-local}/...) are built from this repository and cannot carry a digest.
const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8');
for (const match of compose.matchAll(/^\s*image:\s*(\S+)\s*$/gm)) {
  const ref = match[1];
  if (ref.includes('${')) continue;
  check(
    /@sha256:[0-9a-f]{64}$/.test(ref),
    `docker-compose.yml image "${ref}" is not pinned by digest`,
  );
}

// C4: the ETL and WavePulse images install from a lock file.
for (const name of ['etl', 'wavepulse']) {
  const dockerfile = readFileSync(join(root, name, 'Dockerfile'), 'utf8');
  check(
    /^COPY\s+.*requirements\.lock/m.test(dockerfile),
    `${name}/Dockerfile does not copy requirements.lock`,
  );
  check(
    /^RUN pip install .*-c requirements\.lock/m.test(dockerfile),
    `${name}/Dockerfile does not install requirements with -c requirements.lock`,
  );

  const lockPath = join(root, name, 'requirements.lock');
  check(existsSync(lockPath), `${name}/requirements.lock missing`);
  if (!existsSync(lockPath)) continue;
  const pins = readFileSync(lockPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  check(pins.length > 0, `${name}/requirements.lock pins nothing`);
  for (const line of pins) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*==\S+/.test(line)) {
      check(false, `${name}/requirements.lock line "${line}" is not an exact == pin`);
    }
  }
}

if (failures.length > 0) {
  console.error('acceptance/382 FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('acceptance/382: all criteria pass');
