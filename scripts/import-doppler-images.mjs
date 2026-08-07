import { mkdir, readFile, writeFile } from 'node:fs/promises';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: npm run import:doppler-images -- <dopplers.json>');

const source = JSON.parse(await readFile(sourcePath, 'utf8'));
if (!Array.isArray(source.items)) throw new Error('Doppler image source must contain an items array');

const images = {};
for (const item of source.items) {
  const name = typeof item?.market_hash_name === 'string' ? item.market_hash_name.trim() : '';
  const image = typeof item?.image === 'string' ? item.image.trim() : '';
  if (!name || !image || !isAllowedImage(image)) throw new Error(`Invalid Doppler image record: ${name || '<empty>'}`);
  if (images[name] && images[name] !== image) throw new Error(`Conflicting Doppler image record: ${name}`);
  images[name] = image;
}

const sortedImages = Object.fromEntries(Object.entries(images).sort(([first], [second]) => first.localeCompare(second, 'en', { sensitivity: 'base' })));
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(new URL('../data/doppler-images.json', import.meta.url), JSON.stringify(sortedImages));
console.log(`Imported ${Object.keys(sortedImages).length} Doppler images`);

function isAllowedImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'community.akamai.steamstatic.com';
  } catch {
    return false;
  }
}
