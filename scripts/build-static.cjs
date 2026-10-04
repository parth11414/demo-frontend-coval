const fs = require('fs');
const path = require('path');

// Resolves the project root (parent of the scripts/ directory), regardless of CWD.
const root = path.resolve(__dirname, '..');

// Vercel runs @vercel/static-build in a TEMP directory containing the project
// files, so the static assets can arrive in one of two places:
//   1. public/      (if the repo already has them in public/)
//   2. the repo root (index.html, app.js, styles.css, ... at the top level)
const candidates = [
  path.join(root, 'public'),   // static output dir -> treat as source too
  root,
];

let sourceDir = null;
for (const c of candidates) {
  if (fs.existsSync(c)) sourceDir = c;
}

if (!sourceDir) {
  throw new Error(`build:static could not find any source directory under ${root}`);
}

const publicDir = path.join(root, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const files = fs.existsSync(path.join(sourceDir, 'index.html'))
  ? ['index.html', 'manifest.json', 'icon.svg', 'service-worker.js', 'mock-data.js', 'styles.css', 'app.js', 'coval-logo.jpg']
  : ['index.html']; // fallback: only the entry point is guaranteed

for (const f of files) {
  const src = path.join(sourceDir, f);
  const dest = path.join(publicDir, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  } else {
    // If the static assets are already in public/, nothing to do for that file.
    if (!fs.existsSync(path.join(publicDir, f))) {
      throw new Error(`build:static missing source file: ${f}`);
    }
  }
}

console.log(`build:static copied static assets into ${publicDir}`);
