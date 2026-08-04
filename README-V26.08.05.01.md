# Production Manager V26.08.05.01

This build contains the MYOB customer mapping, WordPress fulfilment and client purchase-order changes from V26.08.04.07.

## Windows ZIP packaging repair

- Excludes all `node_modules`, `.next`, `.turbo`, Git metadata and local environment files.
- Avoids Windows `Destination Path Too Long` extraction errors caused by pnpm's dependency folder structure.
- Run `pnpm install` after extraction to restore dependencies on the destination computer.

Use with Tender Edge WordPress plugin V3.3.26.
