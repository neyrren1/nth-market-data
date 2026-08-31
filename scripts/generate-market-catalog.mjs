import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const outputPath = new URL('../catalog/market-router-index.json', import.meta.url);
const metadataPath = new URL('../catalog/market-router-index.meta.json', import.meta.url);
const columns = ['buff163GoodsId', 'buffMarketGoodsId', 'youpinGoodsId', 'defIndex', 'paintIndex', 'image'];
const allowedImageHosts = new Set(['community.akamai.steamstatic.com', 'cdn.steamstatic.com', 'raw.githubusercontent.com']);
const sourceDefinitions = {
  byMykel: {
    url: 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/all.json',
    repository: 'https://github.com/ByMykel/CSGO-API',
    license: 'MIT'
  },
  byMykelRu: {
    url: 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/ru/all.json',
    repository: 'https://github.com/ByMykel/CSGO-API',
    license: 'MIT',
    fallbackPath: new URL('../data/by-mykel-ru-aliases.json', import.meta.url),
    fallbackLabel: 'data/by-mykel-ru-aliases.json',
    optional: true
  },
  byMykelZhCn: {
    url: 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/zh-CN/all.json',
    repository: 'https://github.com/ByMykel/CSGO-API',
    license: 'MIT',
    optional: true
  },
  marketplaceIds: {
    url: 'https://raw.githubusercontent.com/ModestSerhat/cs2-marketplace-ids/main/cs2_marketplaceids.json',
    repository: 'https://github.com/ModestSerhat/cs2-marketplace-ids',
    license: 'No license file declared upstream'
  },
  ericZhuBuff: {
    url: 'https://raw.githubusercontent.com/EricZhu-42/SteamTradingSite-ID-Mapper/main/buff/730.json',
    repository: 'https://github.com/EricZhu-42/SteamTradingSite-ID-Mapper',
    license: 'CC-BY-4.0'
  },
  ericZhuYouPin: {
    url: 'https://raw.githubusercontent.com/EricZhu-42/SteamTradingSite-ID-Mapper/main/uuyp/730.json',
    repository: 'https://github.com/EricZhu-42/SteamTradingSite-ID-Mapper',
    license: 'CC-BY-4.0'
  }
};

const legacyDopplerPaintIndexes = {
    Ruby: '415', Sapphire: '416', 'Black Pearl': '417',
    'Phase 1': '418', 'Phase 2': '419', 'Phase 3': '420', 'Phase 4': '421'
};
const chromaDopplerPaintIndexes = {
  Ruby: '415', Sapphire: '619', 'Black Pearl': '617',
  'Phase 1': '418', 'Phase 2': '618', 'Phase 3': '420', 'Phase 4': '421'
};
const gammaDopplerPaintIndexes = {
    Emerald: '568', 'Phase 1': '569', 'Phase 2': '570', 'Phase 3': '571', 'Phase 4': '572'
};
const chromaDopplerWeapons = new Set(['★ Butterfly Knife', '★ Shadow Daggers']);

const weaponDefIndexes = {
  'Desert Eagle': '1', 'Dual Berettas': '2', 'Five-SeveN': '3', 'Glock-18': '4', 'AK-47': '7', AUG: '8', AWP: '9',
  FAMAS: '10', G3SG1: '11', 'Galil AR': '13', M249: '14', M4A4: '16', 'MAC-10': '17', P90: '19', 'MP5-SD': '23',
  'UMP-45': '24', XM1014: '25', 'PP-Bizon': '26', 'MAG-7': '27', Negev: '28', 'Sawed-Off': '29', 'Tec-9': '30',
  P2000: '32', MP7: '33', MP9: '34', Nova: '35', P250: '36', 'SCAR-20': '38', 'SG 553': '39', 'SSG 08': '40',
  'M4A1-S': '60', 'USP-S': '61', 'CZ75-Auto': '63', 'R8 Revolver': '64'
};

const dopplerImages = JSON.parse(await readFile(new URL('../data/doppler-images.json', import.meta.url), 'utf8'));
if (!dopplerImages || typeof dopplerImages !== 'object' || Array.isArray(dopplerImages)) throw new Error('Doppler image overrides have an unexpected schema');

const fetchedSources = await Promise.all(Object.entries(sourceDefinitions).map(async ([key, definition]) => {
  try {
    const result = await fetchJson(definition.url);
    return [key, { ...definition, ...result }];
  } catch (error) {
    if (!definition.optional) throw error;
    const fallback = await readFallbackJson(definition);
    if (fallback) return [key, { ...definition, ...fallback, unavailable: String(error?.message || error).slice(0, 300) }];
    return [key, { ...definition, data: null, etag: null, lastModified: null, unavailable: String(error?.message || error).slice(0, 300) }];
  }
}));
const sources = Object.fromEntries(fetchedSources);
const items = new Map();
const aliases = new Map();

const byMykelItems = sources.byMykel.data;
if (!byMykelItems || typeof byMykelItems !== 'object' || Array.isArray(byMykelItems)) {
  throw new Error('ByMykel source has an unexpected schema');
}

for (const item of Object.values(byMykelItems)) {
  const name = normalizeName(item?.market_hash_name);
  if (!name) continue;
  const record = getRecord(items, name);
  record[3] ??= toIntegerString(item.def_index ?? item.weapon?.weapon_id);
  record[4] ??= toIntegerString(item.paint_index, true);
  record[5] ??= normalizeImage(item.image);
}

mergeLocalizedAliases(aliases, sources.byMykelRu.data);
mergeLocalizedAliases(aliases, sources.byMykelZhCn.data);

const marketplaceData = sources.marketplaceIds.data;
if (!marketplaceData?.items || typeof marketplaceData.items !== 'object' || Array.isArray(marketplaceData.items)) {
  throw new Error('Marketplace ID source has an unexpected schema');
}

for (const [rawName, identifiers] of Object.entries(marketplaceData.items)) {
  const name = normalizeName(rawName);
  if (!name || !identifiers || typeof identifiers !== 'object') continue;
  const record = getRecord(items, name);
  record[0] ??= toIntegerString(identifiers.buff163_goods_id);
  record[1] ??= toIntegerString(identifiers.buffmarket_goods_id);
  record[2] ??= toIntegerString(identifiers.youpin_id);
  record[3] ??= inferWeaponDefIndex(name);
}

mergeSimpleIdMap(items, sources.ericZhuBuff.data, 0);
mergeSimpleIdMap(items, sources.ericZhuYouPin.data, 2);
expandDopplerPhases(items, marketplaceData.items);

const sortedItems = {};
const sortedAliases = {};
for (const name of [...items.keys()].sort((first, second) => first.localeCompare(second, 'en', { sensitivity: 'base' }))) {
  const record = items.get(name);
  if (record.some((value) => value !== null)) {
    sortedItems[name] = record;
    const itemAliases = aliases.get(name)?.filter((alias) => alias !== name) || [];
    if (itemAliases.length) sortedAliases[name] = itemAliases;
  }
}

const catalog = { schemaVersion: 2, columns, items: sortedItems, aliases: sortedAliases };
validateCatalog(catalog);
const catalogJson = JSON.stringify(catalog);
const sha256 = createHash('sha256').update(catalogJson).digest('hex');
const existingCatalog = await readFile(outputPath, 'utf8').catch(() => null);

if (existingCatalog === catalogJson) {
  console.log(`Catalog unchanged: ${Object.keys(sortedItems).length} items (${sha256})`);
  process.exit(0);
}

const coverage = Object.fromEntries(columns.map((column, index) => [column, Object.values(sortedItems).filter((record) => record[index] !== null).length]));
const metadata = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  catalog: {
    file: 'market-router-index.json',
    sha256,
    bytes: Buffer.byteLength(catalogJson),
    totalItems: Object.keys(sortedItems).length,
    coverage,
    aliases: {
      localizedItems: Object.keys(sortedAliases).length,
      totalAliases: Object.values(sortedAliases).reduce((total, values) => total + values.length, 0)
    }
  },
  sources: Object.fromEntries(Object.entries(sources).map(([key, source]) => [key, {
    url: source.url,
    repository: source.repository,
    license: source.license,
    etag: source.etag,
    lastModified: source.lastModified,
    fallback: source.fallback,
    unavailable: source.unavailable
  }]))
};

await mkdir(new URL('../catalog/', import.meta.url), { recursive: true });
await writeFile(outputPath, catalogJson);
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Generated ${metadata.catalog.totalItems} items (${metadata.catalog.bytes} bytes, ${sha256})`);

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'NTH-Market-Catalog/1.0' },
        signal: AbortSignal.timeout(60_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > 100_000_000) throw new Error(`response is too large (${contentLength} bytes)`);
      return {
        data: await response.json(),
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified')
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError?.message || lastError}`);
}

async function readFallbackJson(definition) {
  if (!definition.fallbackPath) return null;
  try {
    return {
      data: JSON.parse(await readFile(definition.fallbackPath, 'utf8')),
      etag: null,
      lastModified: null,
      fallback: definition.fallbackLabel
    };
  } catch {
    return null;
  }
}

function normalizeName(value) {
  if (typeof value !== 'string') return '';
  const name = value.trim();
  return name && !name.startsWith('#') && name.length <= 512 ? name : '';
}

function getRecord(records, name) {
  let record = records.get(name);
  if (!record) {
    record = [null, null, null, null, null, null];
    records.set(name, record);
  }
  return record;
}

function toIntegerString(value, allowZero = false) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < (allowZero ? 0 : 1)) return null;
  return String(number);
}

function mergeSimpleIdMap(records, source, columnIndex) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('EricZhu source has an unexpected schema');
  for (const [rawName, rawId] of Object.entries(source)) {
    const name = normalizeName(rawName);
    const id = toIntegerString(rawId);
    if (!name || !id) continue;
    getRecord(records, name)[columnIndex] ??= id;
  }
}

function mergeLocalizedAliases(aliasMap, source) {
  if (source === null) return;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('ByMykel localized source has an unexpected schema');
  for (const [rawName, item] of Object.entries(source)) {
    const name = normalizeName(item?.market_hash_name || rawName);
    const alias = normalizeName(item?.name || item);
    if (!name || !alias || alias === name) continue;
    const values = aliasMap.get(name) || [];
    if (!values.includes(alias)) {
      values.push(alias);
      aliasMap.set(name, values);
    }
  }
}

function expandDopplerPhases(records, marketplaceItems) {
  for (const [rawName, identifiers] of Object.entries(marketplaceItems)) {
    const name = normalizeName(rawName);
    const match = name.match(/^(.* \| ((?:Gamma )?Doppler)) \(([^)]+)\)$/);
    if (!match || !identifiers || typeof identifiers !== 'object') continue;
    const [, finishName, finishType, exterior] = match;
    const buffPhases = identifiers.buff163_phase_ids && typeof identifiers.buff163_phase_ids === 'object' ? identifiers.buff163_phase_ids : {};
    const buffMarketPhases = identifiers.buffmarket_phase_ids && typeof identifiers.buffmarket_phase_ids === 'object' ? identifiers.buffmarket_phase_ids : {};
    const phaseNames = new Set([...Object.keys(buffPhases), ...Object.keys(buffMarketPhases)]);
    const genericRecord = getRecord(records, name);

    for (const phase of phaseNames) {
      const phaseName = `${finishName} ${phase} (${exterior})`;
      const paintIndex = getDopplerPaintIndex(finishType, phase, phaseName);
      if (!paintIndex) continue;
      const phaseImage = normalizeImage(dopplerImages[phaseName]);
      if (!phaseImage) throw new Error(`Missing curated Doppler image: ${phaseName}`);
      const record = getRecord(records, phaseName);
      record[0] = toIntegerString(buffPhases[phase]) ?? record[0];
      record[1] = toIntegerString(buffMarketPhases[phase]) ?? record[1];
      record[2] ??= genericRecord[2];
      record[3] ??= genericRecord[3] ?? inferWeaponDefIndex(phaseName);
      record[4] = paintIndex;
      record[5] = phaseImage;
    }
  }
}

function getDopplerPaintIndex(finishType, phase, marketHashName) {
  if (finishType === 'Gamma Doppler') return gammaDopplerPaintIndexes[phase] ?? null;
  const weaponName = marketHashName.split(' | ')[0].replace(/^★ StatTrak™\s+/, '★ ');
  const paintIndexes = chromaDopplerWeapons.has(weaponName) ? chromaDopplerPaintIndexes : legacyDopplerPaintIndexes;
  return paintIndexes[phase] ?? null;
}

function inferWeaponDefIndex(marketHashName) {
  const weaponName = marketHashName
    .replace(/^★\s+/, '')
    .replace(/^StatTrak™\s+/, '')
    .replace(/^Souvenir\s+/, '')
    .split(' | ')[0]
    .trim();
  return weaponDefIndexes[weaponName] ?? null;
}

function normalizeImage(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && allowedImageHosts.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function validateCatalog(value) {
  const entries = Object.entries(value.items);
  if (value.schemaVersion !== 2 || entries.length < 40_000) throw new Error(`Catalog is incomplete (${entries.length} items)`);
  if (!value.aliases || typeof value.aliases !== 'object' || Array.isArray(value.aliases)) throw new Error('Catalog aliases have an unexpected schema');
  const coverage = Array(columns.length).fill(0);
  for (const [name, record] of entries) {
    if (!normalizeName(name) || !Array.isArray(record) || record.length !== columns.length) throw new Error(`Invalid record: ${name}`);
    record.forEach((field, index) => {
      if (index === 5 && field !== null && normalizeImage(field) !== field) throw new Error(`Invalid image for ${name}`);
      if (index !== 5 && field !== null && !/^\d+$/.test(field)) throw new Error(`Invalid ${columns[index]} for ${name}`);
      if (field !== null) coverage[index] += 1;
    });
    const aliases = value.aliases[name];
    if (aliases !== undefined) {
      if (!Array.isArray(aliases) || aliases.length > 8) throw new Error(`Invalid aliases for ${name}`);
      const seenAliases = new Set();
      for (const alias of aliases) {
        if (!normalizeName(alias) || seenAliases.has(alias)) throw new Error(`Invalid alias for ${name}`);
        seenAliases.add(alias);
      }
    }
  }
  for (const name of Object.keys(value.aliases)) {
    if (!value.items[name]) throw new Error(`Alias references unknown item: ${name}`);
  }
  const minimumCoverage = [30_000, 30_000, 30_000, 40_000, 18_000, 43_000];
  coverage.forEach((count, index) => {
    if (count < minimumCoverage[index]) throw new Error(`${columns[index]} coverage is too low (${count})`);
  });
  validateDopplerCoverage(entries);
}

function validateDopplerCoverage(entries) {
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
  const records = new Map(entries);
  for (const [name, paintIndex] of Object.entries(expectedPaintIndexes)) {
    if (records.get(name)?.[4] !== paintIndex) throw new Error(`Incorrect Doppler paint index: ${name}`);
  }
}
