# Small format product builder separation batch

This batch separates the Product Builder feel for small format products from signage/large format products.

## Why

Small format products such as business cards, flyers, books and carbon books should not look like signage products with signage parts missing. They need their own language and flow.

## Changes

- Small format products now use a dedicated builder mode and colour scheme.
- The builder header changes to **Small format builder** with a purple/violet treatment.
- Small format part rows are now:
  - Paper / card stock
  - Print / click charge
  - Cello / coating
  - Cover stock
  - Binding / tape
  - Numbering / personalisation
  - Bindery labour
  - Outsourced
- Signage-only rows such as Substrate, Print media, Ink / print charge, Laminate and Finishing / hardware are only shown for signage/large-format products.
- The left summary and compatibility/check panel now use small-format wording.
- The small-format builder avoids signage language such as ACM, roll vinyl, eyelets and laminate unless the selected product type actually needs that style of component.
- The starter guide now shows small-format starters as first-class product types, not hidden behind signage examples.

## Intent

The Product Builder should feel like two related workflows:

- **Signage builder:** build panels, roll media, laminate, ink, hardware and installation-style finishing.
- **Small format builder:** build paper/card, print/click charges, cello/coating, bindery, cover stock, numbering and outsourced print processes.

This keeps the PCPartPicker-style idea, but prevents small format from feeling like an add-on to signage.
