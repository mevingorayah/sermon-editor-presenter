# Sermon data directory

JSON file store used by `src/lib/sermon/store.ts`.

- `<id>.json` — sermon document (meta + TipTap content + optional presentation)

Override path with env `SERMON_DATA_DIR`.

**Production note:** Cloud Run disks are ephemeral unless a volume is mounted.
Swap `store.ts` for a database-backed implementation when you outgrow files;
API route shapes stay the same.
