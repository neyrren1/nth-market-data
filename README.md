# NTH Market Data

Versioned CS2 marketplace identifiers for the NTH Market Router browser extension.

The catalog is generated from public upstream datasets. It contains inert data only: market hash names and numeric marketplace/item identifiers. URL templates and all application logic remain bundled with the extension.

## Files

- `catalog/market-router-index.json`: compact runtime catalog.
- `catalog/market-router-index.meta.json`: generation time, coverage, source URLs and SHA-256.
- `data/doppler-images.json`: curated phase-specific Doppler images.
- `scripts/generate-market-catalog.mjs`: deterministic source merger and Doppler phase expansion.
- `scripts/validate-market-catalog.mjs`: schema, coverage and integrity checks.

Runtime endpoint:

```text
https://raw.githubusercontent.com/neyrren1/nth-market-data/main/catalog/market-router-index.json
```

## Catalog Schema

Each item is keyed by its exact Steam `market_hash_name`. Values use the column order declared at the top of the catalog:

```json
{
  "schemaVersion": 1,
  "columns": ["buff163GoodsId", "buffMarketGoodsId", "youpinGoodsId", "defIndex", "paintIndex", "image"],
  "items": {
    "AK-47 | Redline (Field-Tested)": ["...", "...", "...", "7", "282", "https://..."]
  }
}
```

Missing values are `null`. Images must use HTTPS and one of the explicitly allowed Steam/GitHub image hosts. Phase-specific BUFF163 and BUFF Market IDs are never replaced by a generic Doppler ID; unavailable phase IDs remain `null`. The remote data never contains executable code or marketplace URL templates.

## Updating

The `Update market catalog` workflow runs every Sunday and can also be started manually from the Actions tab. It downloads each source over HTTPS, merges exact names, expands Doppler phase identifiers and phase images, validates minimum coverage and commits only when the resulting catalog changes. Doppler generation fails rather than publishing a phase without its curated image.

Local commands require Node.js 22 or newer:

```bash
npm run generate
npm run validate
```

Maintainers can refresh the checked-in TradeBook Doppler image overrides before generation:

```bash
npm run import:doppler-images -- /path/to/dopplers.json
```

## Sources And Attribution

- [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API), MIT License, Copyright (c) 2023 ByMykel.
- [EricZhu-42/SteamTradingSite-ID-Mapper](https://github.com/EricZhu-42/SteamTradingSite-ID-Mapper), CC BY 4.0. The catalog selects, renames and merges fields from the original mappings.
- [ModestSerhat/cs2-marketplace-ids](https://github.com/ModestSerhat/cs2-marketplace-ids). The upstream repository currently declares no license file; no additional rights are granted here.

The generated catalog may be incomplete or outdated. Marketplace identifiers are validated structurally but are not guaranteed to resolve indefinitely.
