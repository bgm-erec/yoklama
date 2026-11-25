import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distStandaloneDir = path.join(rootDir, 'dist-standalone');
const assetsDir = path.join(distStandaloneDir, 'assets');
const outputHtmlPath = path.join(rootDir, 'public', 'bach.html');
const faviconPath = path.join(rootDir, 'public', 'favicon.png');

function escapeInlineScript(jsCode) {
  return jsCode.replace(/<\/script/gi, '<\\/script');
}

function escapeInlineStyle(cssCode) {
  return cssCode.replace(/<\/style/gi, '<\\/style');
}

function buildStandalone() {
  fs.rmSync(distStandaloneDir, { recursive: true, force: true });

  console.log('[build-standalone] Running Vite production standalone build...');
  execSync('npx vite build', {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      VITE_STANDALONE: '1',
    },
  });

  if (!fs.existsSync(assetsDir)) {
    throw new Error(`Expected assets directory at ${assetsDir}`);
  }

  const assetFiles = fs.readdirSync(assetsDir);
  const jsFiles = assetFiles.filter(f => f.endsWith('.js'));
  const cssFiles = assetFiles.filter(f => f.endsWith('.css'));

  if (jsFiles.length !== 1) {
    throw new Error(
      `Expected exactly 1 standalone JS bundle in ${assetsDir}, found ${jsFiles.length}: ${jsFiles.join(', ')}`
    );
  }
  if (cssFiles.length !== 1) {
    throw new Error(
      `Expected exactly 1 standalone CSS bundle in ${assetsDir}, found ${cssFiles.length}: ${cssFiles.join(', ')}`
    );
  }

  const jsCode = fs.readFileSync(path.join(assetsDir, jsFiles[0]), 'utf8');
  const cssCode = fs.readFileSync(path.join(assetsDir, cssFiles[0]), 'utf8');
  const faviconBase64 = fs.readFileSync(faviconPath).toString('base64');

  const standaloneHtml = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>bach</title>
    <link rel="icon" type="image/png" href="data:image/png;base64,${faviconBase64}" />
    <meta name="description" content="bach — Boğaziçi Gençlik Merkezi yoklama ve katılım takip sistemi" />
    <meta property="og:title" content="bach" />
    <meta property="og:description" content="bach — Boğaziçi Gençlik Merkezi yoklama ve katılım takip sistemi" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <style>${escapeInlineStyle(cssCode)}</style>
  </head>
  <body class="bg-[#f7f4ee] text-[#1f1d1a] antialiased selection:bg-[#1f1d1a] selection:text-[#f7f4ee]">
    <div id="root"></div>
    <script>window.__BACH_STANDALONE__ = true;</script>
    <script>${escapeInlineScript(jsCode)}</script>
  </body>
</html>
`;

  fs.writeFileSync(outputHtmlPath, standaloneHtml, 'utf8');
  fs.rmSync(distStandaloneDir, { recursive: true, force: true });

  const stats = fs.statSync(outputHtmlPath);
  console.log(
    `[build-standalone] Generated ${outputHtmlPath} (${(stats.size / 1024).toFixed(1)} KB | JS ${(jsCode.length / 1024).toFixed(1)} KB | CSS ${(cssCode.length / 1024).toFixed(1)} KB | favicon ${(faviconBase64.length / 1024).toFixed(1)} KB base64)`
  );
}

buildStandalone();
