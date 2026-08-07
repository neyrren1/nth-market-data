import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const catalogText = await readFile(new URL('../catalog/market-router-index.json', import.meta.url), 'utf8');
const metadata = JSON.parse(await readFile(new URL('../catalog/market-router-index.meta.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(catalogText);
const entries = Object.entries(catalog.items || {});
const columns = ['buff163GoodsId', 'buffMarketGoodsId', 'youpinGoodsId', 'defIndex', 'paintIndex'];
const coverage = Array(columns.length).fill(0);

if (catalog.schemaVersion !== 1 || metadata.schemaVersion !== 1) throw new Error('Unsupported schema version');
if (JSON.stringify(catalog.columns) !== JSON.stringify(columns)) throw new Error('Unexpected catalog columns');
if (entries.length < 40_000) throw new Error(`Catalog is incomplete (${entries.length} items)`);

let previousName = '';
for (const [name, record] of entries) {
  if (!name || name.trim() !== name || name.startsWith('#') || name.length > 512) throw new Error(`Invalid market hash name: ${name}`);
  if (previousName && previousName.localeCompare(name, 'en', { sensitivity: 'base' }) > 0) throw new Error(`Catalog is not sorted near ${name}`);
  if (!Array.isArray(record) || record.length !== columns.length) throw new Error(`Invalid record: ${name}`);
  record.forEach((field, index) => {
    if (field !== null && (typeof field !== 'string' || !/^\d+$/.test(field))) throw new Error(`Invalid ${columns[index]} for ${name}`);
    if (field !== null) coverage[index] += 1;
  });
  previousName = name;
}

const sha256 = createHash('sha256').update(catalogText).digest('hex');
if (metadata.catalog.sha256 !== sha256) throw new Error('Catalog SHA-256 does not match metadata');
if (metadata.catalog.bytes !== Buffer.byteLength(catalogText)) throw new Error('Catalog byte size does not match metadata');
if (metadata.catalog.totalItems !== entries.length) throw new Error('Catalog item count does not match metadata');

columns.forEach((column, index) => {
  if (metadata.catalog.coverage[column] !== coverage[index]) throw new Error(`${column} coverage does not match metadata`);
});

const minimumCoverage = [30_000, 30_000, 30_000, 40_000, 18_000];
coverage.forEach((count, index) => {
  if (count < minimumCoverage[index]) throw new Error(`${columns[index]} coverage is too low (${count})`);
});

console.log(`Validated ${entries.length} items (${sha256})`);
