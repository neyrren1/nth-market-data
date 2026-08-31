import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const catalogText = await readFile(new URL('../catalog/market-router-index.json', import.meta.url), 'utf8');
const metadata = JSON.parse(await readFile(new URL('../catalog/market-router-index.meta.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(catalogText);
const entries = Object.entries(catalog.items || {});
const columns = ['buff163GoodsId', 'buffMarketGoodsId', 'youpinGoodsId', 'defIndex', 'paintIndex', 'image'];
const allowedImageHosts = new Set(['community.akamai.steamstatic.com', 'cdn.steamstatic.com', 'raw.githubusercontent.com']);
const coverage = Array(columns.length).fill(0);

if (catalog.schemaVersion !== 2 || metadata.schemaVersion !== 2) throw new Error('Unsupported schema version');
if (JSON.stringify(catalog.columns) !== JSON.stringify(columns)) throw new Error('Unexpected catalog columns');
if (entries.length < 40_000) throw new Error(`Catalog is incomplete (${entries.length} items)`);
if (!catalog.aliases || typeof catalog.aliases !== 'object' || Array.isArray(catalog.aliases)) throw new Error('Unexpected catalog aliases');
if (!catalog.buff163TagIds || typeof catalog.buff163TagIds !== 'object' || Array.isArray(catalog.buff163TagIds)) throw new Error('Unexpected BUFF163 tag ids');

let previousName = '';
for (const [name, record] of entries) {
  if (!name || name.trim() !== name || name.startsWith('#') || name.length > 512) throw new Error(`Invalid market hash name: ${name}`);
  if (previousName && previousName.localeCompare(name, 'en', { sensitivity: 'base' }) > 0) throw new Error(`Catalog is not sorted near ${name}`);
  if (!Array.isArray(record) || record.length !== columns.length) throw new Error(`Invalid record: ${name}`);
  record.forEach((field, index) => {
    if (index === 5 && field !== null && !isAllowedImage(field)) throw new Error(`Invalid image for ${name}`);
    if (index !== 5 && field !== null && (typeof field !== 'string' || !/^\d+$/.test(field))) throw new Error(`Invalid ${columns[index]} for ${name}`);
    if (field !== null) coverage[index] += 1;
  });
  const aliases = catalog.aliases[name];
  if (aliases !== undefined) {
    if (!Array.isArray(aliases) || aliases.length > 8) throw new Error(`Invalid aliases for ${name}`);
    const seenAliases = new Set();
    for (const alias of aliases) {
      if (typeof alias !== 'string' || !alias.trim() || alias.trim() !== alias || alias.startsWith('#') || alias.length > 512 || seenAliases.has(alias)) {
        throw new Error(`Invalid alias for ${name}`);
      }
      seenAliases.add(alias);
    }
  }
  previousName = name;
}

for (const name of Object.keys(catalog.aliases)) {
  if (!catalog.items[name]) throw new Error(`Alias references unknown item: ${name}`);
}

for (const [name, tagId] of Object.entries(catalog.buff163TagIds)) {
  if (!catalog.items[name] || typeof tagId !== 'string' || !/^\d+$/.test(tagId)) throw new Error(`Invalid BUFF163 tag id for ${name}`);
}

const sha256 = createHash('sha256').update(catalogText).digest('hex');
if (metadata.catalog.sha256 !== sha256) throw new Error('Catalog SHA-256 does not match metadata');
if (metadata.catalog.bytes !== Buffer.byteLength(catalogText)) throw new Error('Catalog byte size does not match metadata');
if (metadata.catalog.totalItems !== entries.length) throw new Error('Catalog item count does not match metadata');
const totalAliases = Object.values(catalog.aliases).reduce((total, aliases) => total + aliases.length, 0);
if (!metadata.catalog.aliases || metadata.catalog.aliases.localizedItems !== Object.keys(catalog.aliases).length || metadata.catalog.aliases.totalAliases !== totalAliases) throw new Error('Catalog alias metadata does not match');
if (!metadata.catalog.buff163TagIds || metadata.catalog.buff163TagIds.totalItems !== Object.keys(catalog.buff163TagIds).length) throw new Error('Catalog BUFF163 tag id metadata does not match');

columns.forEach((column, index) => {
  if (metadata.catalog.coverage[column] !== coverage[index]) throw new Error(`${column} coverage does not match metadata`);
});

const minimumCoverage = [30_000, 30_000, 30_000, 40_000, 18_000, 43_000];
coverage.forEach((count, index) => {
  if (count < minimumCoverage[index]) throw new Error(`${columns[index]} coverage is too low (${count})`);
});

const phases = entries.filter(([name]) => /\| (?:Gamma )?Doppler (?:Phase [1-4]|Ruby|Sapphire|Black Pearl|Emerald) \(/.test(name));
if (phases.length < 700) throw new Error(`Doppler phase coverage is too low (${phases.length})`);
if (phases.filter(([, record]) => record[0] !== null).length < 700) throw new Error('BUFF163 Doppler phase coverage is too low');
if (phases.filter(([, record]) => record[1] !== null).length < 650) throw new Error('BUFF Market Doppler phase coverage is too low');
for (const [name, record] of phases) {
  if (record[3] === null || record[4] === null || record[5] === null) throw new Error(`Incomplete Doppler phase record: ${name}`);
}

const expectedPaintIndexes = {
  '★ Butterfly Knife | Doppler Phase 2 (Factory New)': '618',
  '★ Butterfly Knife | Doppler Sapphire (Factory New)': '619',
  '★ Butterfly Knife | Doppler Black Pearl (Factory New)': '617',
  '★ Bayonet | Doppler Phase 2 (Factory New)': '419',
  'Glock-18 | Gamma Doppler Emerald (Factory New)': '568'
};
for (const [name, paintIndex] of Object.entries(expectedPaintIndexes)) {
  if (catalog.items[name]?.[4] !== paintIndex) throw new Error(`Incorrect Doppler paint index: ${name}`);
}

console.log(`Validated ${entries.length} items (${sha256})`);

function isAllowedImage(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && allowedImageHosts.has(url.hostname) && url.href === value;
  } catch {
    return false;
  }
}
