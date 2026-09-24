/**
 * The product's name as people see it: the macOS menu (and its About, Hide and
 * Quit items), window titles, and the packaged app. Keep electron-builder.yml's
 * `productName` equal to this; `test/app-name.test.cjs` holds them together.
 */
export const APP_NAME = "Don't Be Michael";

/** The data folder under Application Support. It keeps the name it has always
 *  had, so renaming the app never looks like a fresh install (Electron would
 *  otherwise derive the folder from the new name and start empty). */
export const APP_DATA_DIR = 'munder-difflin';

/** The URL scheme the app registers for shareable hires
 *  (`dontbemichael://hire?src=<https-url>`). Was `munderdifflin://`, which the
 *  upstream project's website links to; claiming it would have opened this app
 *  on their hire gallery's links (owner, 2026-09-24). */
export const APP_URL_SCHEME = 'dontbemichael';
