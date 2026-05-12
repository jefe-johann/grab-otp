import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFiles = ['.env', '.env.local', '.env.production', '.env.production.local'];
const env = {};

for (const fileName of envFiles) {
  const filePath = resolve(rootDir, fileName);
  if (!existsSync(filePath)) {
    continue;
  }

  Object.assign(env, parseEnvFile(readFileSync(filePath, 'utf8')));
}

Object.assign(env, process.env);

const clientId = env.SAFARI_CLIENT_ID?.trim();
const suffix = '.apps.googleusercontent.com';

if (!clientId || clientId.includes('your-safari-client-id')) {
  fail([
    'Missing SAFARI_CLIENT_ID.',
    '',
    'Create a Google OAuth client for the Safari/macOS app, add it to .env, then rerun npm run package:safari:',
    '  SAFARI_CLIENT_ID=1234567890-abcdef.apps.googleusercontent.com',
    '',
    'Tip: Safari uses a native-app OAuth redirect, not the Chrome extension redirect.'
  ]);
}

if (!clientId.endsWith(suffix)) {
  fail([
    'Invalid SAFARI_CLIENT_ID.',
    '',
    'Expected a Google OAuth client ID ending in .apps.googleusercontent.com.'
  ]);
}

const callbackScheme = `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
const redirectUri = `${callbackScheme}:/oauth2redirect`;

console.log('Safari OAuth config OK.');
console.log(`Safari redirect URI: ${redirectUri}`);

function parseEnvFile(contents) {
  const parsed = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (!key) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function fail(lines) {
  console.error(lines.join('\n'));
  process.exit(1);
}
