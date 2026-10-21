# Built-in physical thread starter catalogs

Version: 2026-10-20.1. These are **171 factual starter entries across seven brands**,
not complete catalogs or guaranteed cross-brand matches. Floriani is not populated yet.

| Brand / collection                    |   Entries | Evidence                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | --------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New brothread, 150 Assorted Polyester | 70 solids | User-supplied 150-assorted chart; [manufacturer's numbered variants](https://newbrothread-official.com/products/new-brothread-40wt-poly-thread-5000m-per-spool-includes-brother-variegated-colors-for-commercial-home-use)                                                                                                                                                              |
| Brother, Embroidery                   |        12 | [Brother published guide](https://www.brother-usa.com/Virdata/SAPHTMLEditorFiles/5329756EC43812B7E1000000CD8620B8.PDF), Embroidery column                                                                                                                                                                                                                                               |
| Simthread, 63 Spools Polyester        |        23 | [Simthread's 2023 chart](https://cdn.shopify.com/s/files/1/0095/8224/7991/files/Simthread_63_Colors_Conversion_Chart_2023_Ma.pdf?v=1694675298), linked from its [download page](https://www.simthreads.com/pages/download)                                                                                                                                                              |
| Madeira, Polyneon                     |        12 | Brother guide, Polyneon column; official color names not asserted                                                                                                                                                                                                                                                                                                                       |
| Sulky, Rayon                          |        12 | Brother guide, Sulky Rayon column; official color names not asserted                                                                                                                                                                                                                                                                                                                    |
| Robison-Anton, Polyester              |        12 | Brother guide, R.A. Polyester column; official color names not asserted                                                                                                                                                                                                                                                                                                                 |
| Isacord, Polyester                    |        30 | [AMANN digital overview](https://www.amann.com/fileadmin/user_upload/Download_Center/Digital_colour_cards/Isacord_colour_card_scan.pdf) plus [published popular-color kit listing](https://isacordthread.com/item/Isacord_Embroidery_Thread_Most_Popular_Colors_Kit_1/11900/c270) for names and older identifiers; not every older kit identifier appears in the current AMANN overview |

## Data and rights review

`src/thread-starters.js` is an independently assembled selection of factual product
identifiers, short published color labels where established, and original Studio
screen-color estimates. No chart image, watermark, logo, source layout, full third-party
palette, manufacturer RGB dataset, PANTONE reference or conversion table is included.
The Brother guide is evidence that a listed identifier exists in the indicated line;
this implementation does **not** represent its rows as exact official substitutions.
Source charts are reference material; no license to reproduce their artwork is claimed.
Brand names identify products and do not imply endorsement.

The RGB values were authored as rough visual estimates, not extracted from the
ThreadResearch archive or copied from chart pixels. They are classified
`studio-approximation`, never manufacturer-published or measured. Metallic/variegated
products are omitted from this starter rather than pretending a single HEX reproduces
their behavior. Product availability, spool sizes and weight are not inferred.
Use a physical shade card/spool before final sewing. Users can correct a screen
approximation, preserving the physical identifier. Future measured or licensed values
need their own source/accuracy review.

## Updates and personal data

Built-ins are read-only module records with stable brand/line/text-number IDs. They
are not copied into IndexedDB or inventory wholesale. A personal correction wins over
a new built-in value. Owned spools and saved projects retain snapshots even if a
catalog is removed. Backups contain personal records, preferences and inventory;
installed starter catalogs ship with the app. Library management can turn starter
browsing off without erasing data. Missing catalogs and label-only records stay readable.

Changes to starter coverage require source review and tests; the existing public-asset
policy still rejects raw research archives, GPL palettes and unreviewed CSV/JSON packs.
