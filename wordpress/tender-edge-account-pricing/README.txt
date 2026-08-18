Tender Edge Account Pricing 1.0.0
=================================

Purpose
-------
Adds logged-in MYOB customer Level A-F pricing to the existing Tender Edge WooCommerce / Production Manager product builder without replacing the main website platform plugin.

Behaviour
---------
* Logged-out visitor: public Level A pricing.
* Logged-in customer: PM resolves the linked client by PM client ID where available, then email/company, and applies that client's MYOB Level A-F pricing.
* PM-calculated work: uses the configured PM A-F factor.
* MYOB-linked items: uses the imported MYOB Item Price Matrix and quantity break for the customer's A-F level. PM factor is not layered on top.
* Add to Cart: server-side WooCommerce pricing requests receive the same customer context, so the final cart price is revalidated by Production Manager.

Setup
-----
The add-on attempts to discover the existing Production Manager URL/API key from WordPress options and outgoing PM requests.
If it cannot, open Settings > Tender Edge Account Pricing and paste the same pm_... API key already used by the Tender Edge website integration.
