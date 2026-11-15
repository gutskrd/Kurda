/**
 * The Android letter widget's name and description, in the app's nine
 * languages, for the phone's list of widgets.
 *
 * The widget itself is added by its library's own config plugin
 * (react-native-android-widget in app.json), which writes the receiver into
 * the manifest and the widget's provider description. Its name and its
 * description there are given as references — `@string/letter_widget_name`
 * and `@string/letter_widget_description` — and this writes those two
 * strings into the generated project: English as the default, and one
 * resource folder for each other language the app speaks, so a phone in
 * German lists "Brief" and one in Soranî "نامە". The words come from
 * src/widget/widget-strings.json, the one place the widget's words are
 * written (the iPhone widget's Localizable.strings and the Android widget's
 * own drawing read the same file).
 *
 * A separate file in each folder, so nothing another plugin writes into
 * strings.xml is touched. CommonJS, because the build loads config plugins
 * with require and this package is an ES module.
 */
const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

const STRINGS = require('../src/widget/widget-strings.json');

/**
 * The resource folder for each language: English is the default; the others
 * in the BCP 47 form, which Soranî needs (it has no two-letter code), and in
 * the folders Expo already makes for the app's languages (app.json `locales`).
 */
const FOLDERS = { en: 'values', ku: 'values-b+ku', ckb: 'values-b+ckb', ar: 'values-b+ar', tr: 'values-b+tr', de: 'values-b+de', fr: 'values-b+fr', nl: 'values-b+nl', es: 'values-b+es' };

/** A string as an Android resource holds it: XML-escaped, and Android's own quoting for an apostrophe, a quote or a leading @ or ?. */
function resourceText(text) {
  const xml = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return xml.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/^([@?])/, '\\$1');
}

function stringsXml(table) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Written at build time by plugins/withLetterWidgetStrings.cjs from src/widget/widget-strings.json. -->',
    '<resources>',
    `    <string name="letter_widget_name">${resourceText(table.name)}</string>`,
    `    <string name="letter_widget_description">${resourceText(table.description)}</string>`,
    '</resources>',
    '',
  ].join('\n');
}

function withLetterWidgetStrings(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res');
      for (const [locale, folder] of Object.entries(FOLDERS)) {
        const table = STRINGS[locale];
        if (!table) throw new Error(`withLetterWidgetStrings: no widget words for ${locale} in src/widget/widget-strings.json`);
        fs.mkdirSync(path.join(res, folder), { recursive: true });
        fs.writeFileSync(path.join(res, folder, 'letter_widget_strings.xml'), stringsXml(table));
      }
      return cfg;
    },
  ]);
}

module.exports = withLetterWidgetStrings;
module.exports.resourceText = resourceText;
module.exports.FOLDERS = FOLDERS;
