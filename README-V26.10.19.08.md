# Production Manager V26.10.19.08

## Simplified shop operations

Production Manager now separates simple shop work from genuine machine costing.

### Shop Operations
- Labour & Time has been reframed as **Shop Operations**.
- A shop operation can now link one optional consumable/material directly from Materials.
- Each operation stores:
  - operation name / work area
  - optional linked consumable
  - consumable quantity and usage basis
  - labour rate
  - labour time basis
  - optional minimum labour time
- Consumable bases support per operation unit, per finished item, per linear metre and per square metre.
- Quick-start templates now include Eyelets, Book edge tape and Spiral binding.

### Quote costing
- Finishing processes can automatically bring both their linked consumable cost and labour cost into quote costing.
- Eyelets prefer the consumable explicitly linked to the Eyelets shop operation, while retaining compatibility with the existing Eyelet material lookup.
- Small-format finishing operations can also consume their linked material automatically, allowing setups such as spiral binding and book edge tape without separate manual material rules.

### Machines remain for real machine costs
- Machines are still used for printers, guillotines, Jingwei/CNC/router equipment and similar resources where speed, wear, ink, bits, setup time, width/capacity or hourly machine cost matters.
- Ordinary finishing no longer needs a fake machine cost. Processes can link only a Shop Operation when that is all they need.

### Data compatibility
- Existing labour operations remain valid.
- New consumable fields are added to `catalog.labour_operations` using additive columns only.
- Existing processes, recipes and quote snapshots remain compatible.

Version: V26.10.19.08
