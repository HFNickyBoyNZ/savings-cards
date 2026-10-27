# Cards

A small, ad-free web app that keeps loyalty and savings card barcodes in one place on an iPhone. It opens instantly, works with no signal, and needs no account.

**Live app:** https://hfnickyboynz.github.io/savings-cards/

## Privacy

Card numbers are stored only in the browser on the phone (local storage). Nothing is sent anywhere. This repo holds the app code only, never card data. Backup files are git-ignored.

- **Backups are plain text.** An exported backup contains every card number unencrypted. Wherever it is saved gets a copy.
- **Shared hostname.** Every GitHub Pages project site under this account is served from `hfnickyboynz.github.io`, and browser storage is shared per hostname, not per repo. Any other Pages site published from this account could read the cards. Before publishing another Pages site here, move this app to its own domain or accept that risk.

## Install on iPhone

1. Open the live app link in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open **Cards** from the home screen (not from Safari: the home-screen app keeps its own storage).

## Add a card

Tap **+ Add**, then either:

- **Scan with camera**: point at the physical card's barcode.
- **Scan a photo**: pick a photo or a screenshot of the barcode from the retailer's app.
- Type the number and pick the barcode type.

The preview shows the barcode as it will be drawn. Check the number matches the card.

## Back up

Tap **⋯** then **Export backup** and save the file to iCloud Drive or Files. **Import backup** merges a backup back in. Do this after adding cards: if the home-screen app is deleted, its cards go with it.

## How it works

Plain HTML, CSS and JavaScript, no build step. A service worker caches everything for offline use.

- Barcode drawing: [bwip-js](https://github.com/metafloor/bwip-js) 4.11.4 (MIT), in `vendor/`.
- Barcode scanning: [ZXing for JS](https://github.com/zxing-js/library) 0.21.3 (Apache 2.0), in `vendor/`.

When changing any file, bump `CACHE` in `sw.js` and `APP_VERSION` in `app.js`, or phones keep the old version.
