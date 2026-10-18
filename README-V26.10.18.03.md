# Production Manager V26.10.18.03

## Material Price Manager quote visuals

- Adds **Quote category** to the in-app Material Price Manager table.
- Adds **Quote image** directly to each existing material row with thumbnail, Upload / Replace and Remove controls.
- Quote category saves with the normal bulk **Save changes** workflow.
- Quote image uploads save immediately to the existing `quote-visuals` storage bucket and refresh the visual quote wizard data.
- New unsaved rows show **Save first** for images; after the material is created an image can be uploaded from the same table.
- The table receives each material's existing `quoteVisualCategory`, `quoteImageUrl` and `quoteImageStoragePath`, so the spreadsheet-style editor now reflects the same data as the individual Material edit form.
- Material Price Manager saves category changes to `catalog.materials.quote_visual_category` and the JSON fallback used by the compatibility layer.
- Existing material/category image functionality and the V26.10.18.02 selected-quote crash fix are retained.

Version: V26.10.18.03
