# Wind Skill Update Check Flow

This document describes the recommended update-check flow for `wind-mcp-skill`.

## Goal

The skill should only check and notify. It should not update files automatically.
The actual update should remain delegated to the official `skills` CLI:

```bash
npx skills update wind-mcp-skill -g -y
```

## Recommended Flow

```text
User calls Wind data
        |
        v
cli.mjs call
        |
        +------------------------------+
        |                              |
        v                              v
Start check-update in background   Execute real Wind MCP request
        |                              |
        v                              v
Read update-state cache            Return Wind data
        |
        v
Is cache fresh?
        |
   +----+----+
   |         |
  yes        no
   |         |
   v         v
exit      Read global/project lock
             |
             v
          Find name = wind-mcp-skill
             |
             v
          Found?
             |
      +------+------+
      |             |
     no             yes
      |             |
      v             v
write cache:      Read lock entry:
unknown           - sourceUrl
reason:           - sourceType
lock missing      - ref
                  - skillPath
                  - skillFolderHash
                     |
                     v
              Is source checkable?
                     |
              +------+------+
              |             |
             no             yes
              |             |
              v             v
write cache: unknown       Fetch remote tree
reason: local/unknown      using sourceUrl + ref
                            |
                            v
                      Fetch result?
                            |
              +-------------+-------------+
              |             |             |
            failed      path missing     success
              |             |             |
              v             v             v
write cache: transient   write cache:    get remoteHash
error                    unknown             |
                         reason:             v
                         path mismatch    Compare remoteHash
                                          with skillFolderHash
                                                |
                                                v
                                           Same hash?
                                                |
                                         +------+------+
                                         |             |
                                        yes            no
                                         |             |
                                         v             v
                                  write cache:     write cache:
                                  up_to_date       update_available
                                                  with remoteHash
                                                  and sourceUrl
```

## Notify After Main Call

```text
cli.mjs call finishes
        |
        v
Read update-state cache
        |
        v
Cache status?
        |
 +------+--------------+------------------+
 |                     |                  |
up_to_date        unknown/error      update_available
 |                     |                  |
 v                     v                  v
No prompt       Low-frequency        Print exact update
                diagnostic prompt    command to stderr
```

## Key Rules

- Use `name`, `sourceUrl`, `ref`, `skillPath`, and `skillFolderHash` from the lock file.
- Do not hard-code a single repository owner as the only valid source.
- If the lock entry is missing or unsupported, write `unknown`, not `ok`.
- If the remote path cannot be found, write `unknown`, not `ok`.
- If the network fails, preserve the previous cache or write a transient error.
- Do not mutate skill files in the background.
- Let `npx skills update` perform the actual update and refresh the lock file.
