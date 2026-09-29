import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Standard Brand SVG (for tab icon & base for pngs)
const svgStandard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#09090b" />
      <stop offset="50%" stop-color="#141416" />
      <stop offset="100%" stop-color="#040d08" />
    </linearGradient>
    <linearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#10b981" flood-opacity="0.35" />
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)" />
  <rect width="508" height="508" x="2" y="2" rx="110" fill="none" stroke="#27272a" stroke-width="3" opacity="0.6" />
  <!-- Neural Spark Core -->
  <circle cx="256" cy="256" r="170" fill="none" stroke="#10b981" stroke-width="4" stroke-dasharray="14 10" opacity="0.3" />
  <circle cx="256" cy="256" r="130" fill="none" stroke="#34d399" stroke-width="2" stroke-dasharray="8 8" opacity="0.4" />

  <!-- Iconic E Monogram -->
  <g filter="url(#shadow)">
    <!-- Vertical stem -->
    <rect x="144" y="136" width="56" height="240" rx="20" fill="url(#glowGrad)" />
    <!-- Top bar -->
    <rect x="144" y="136" width="216" height="52" rx="20" fill="url(#glowGrad)" />
    <!-- Middle bar with neural dot -->
    <rect x="144" y="230" width="160" height="48" rx="18" fill="url(#glowGrad)" />
    <!-- Bottom bar -->
    <rect x="144" y="324" width="216" height="52" rx="20" fill="url(#glowGrad)" />
    <!-- Accent Spark -->
    <circle cx="360" cy="254" r="22" fill="#6ee7b7" />
    <path d="M360 216 L364 246 L394 254 L364 262 L360 292 L356 262 L326 254 L356 246 Z" fill="#ffffff" opacity="0.9" />
  </g>
</svg>`;

// 2. Maskable SVG with safe 15% margin for Android squircle / circle cutouts
const svgMaskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGradMask" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#09090b" />
      <stop offset="100%" stop-color="#06120b" />
    </linearGradient>
    <linearGradient id="glowGradMask" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
  </defs>
  <!-- Full bleed background for maskable -->
  <rect width="512" height="512" fill="url(#bgGradMask)" />
  <!-- Safe Zone Graphic scaled inside 80% box -->
  <g transform="translate(64, 64) scale(0.75)">
    <!-- Circular ambient orbit -->
    <circle cx="256" cy="256" r="160" fill="none" stroke="#10b981" stroke-width="4" stroke-dasharray="14 10" opacity="0.35" />
    <!-- Monogram -->
    <rect x="144" y="136" width="56" height="240" rx="20" fill="url(#glowGradMask)" />
    <rect x="144" y="136" width="216" height="52" rx="20" fill="url(#glowGradMask)" />
    <rect x="144" y="230" width="160" height="48" rx="18" fill="url(#glowGradMask)" />
    <rect x="144" y="324" width="216" height="52" rx="20" fill="url(#glowGradMask)" />
    <circle cx="360" cy="254" r="22" fill="#6ee7b7" />
    <path d="M360 216 L364 246 L394 254 L364 262 L360 292 L356 262 L326 254 L356 246 Z" fill="#ffffff" />
  </g>
</svg>`;

async function generate() {
  console.log('Writing public/icon.svg...');
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgStandard, 'utf8');

  console.log('Generating pwa-512x512.png...');
  await sharp(Buffer.from(svgStandard))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  console.log('Generating pwa-192x192.png...');
  await sharp(Buffer.from(svgStandard))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  console.log('Generating pwa-maskable-512x512.png...');
  await sharp(Buffer.from(svgMaskable))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));

  console.log('Generating apple-touch-icon.png (180x180)...');
  await sharp(Buffer.from(svgStandard))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  console.log('Generating favicon.ico...');
  await sharp(Buffer.from(svgStandard))
    .resize(64, 64)
    .png()
    .toFile(path.join(publicDir, 'favicon.ico'));

  console.log('All PWA icons generated successfully!');
}

generate().catch(console.error);
