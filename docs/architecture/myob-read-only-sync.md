# MYOB refresh token + first read-only sync

This batch adds:
- refresh-token handling before MYOB API reads
- first read-only sync against the connected company file
- safe summary logging into integration.sync_runs
- no write-back to MYOB records yet

Current endpoints attempted:
- /Company/Preferences/Company
- /Contact/Customer?$top=50
- /Contact/Supplier?$top=50
- /Inventory/Item?$top=50
