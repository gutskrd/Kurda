import Foundation

// The widget's own few words, in the language the app is in.
//
// The phone's language and the app's need not be the same — somebody may
// keep their phone in German and learn in Kurmancî — and the widget is part
// of the app, so it speaks the app's (left in the App Group as
// `letterWidget.locale`). The words are in <lang>.lproj/Localizable.strings
// beside this file, one folder for each of the app's nine languages, copied
// from mobile/src/widget/widget-strings.json, which is where they are
// written; mobile/src/widget/widget.test.ts holds the two to each other.
//
// The widget's name and description in the phone's list of widgets are
// looked up by the system in the phone's own language instead (`Text("name")`
// in LetterWidget.swift), since they are shown before the app has said
// anything.

enum Words {
  private static func bundle(_ locale: String) -> Bundle? {
    guard let path = Bundle.main.path(forResource: locale, ofType: "lproj") else { return nil }
    return Bundle(path: path)
  }

  /// One of the widget's words in `locale`, else in English; `{name}` and the like filled in.
  static func text(_ key: String, locale: String, _ values: [String: String] = [:]) -> String {
    var said = bundle(locale)?.localizedString(forKey: key, value: nil, table: nil) ?? key
    if said == key { said = bundle("en")?.localizedString(forKey: key, value: nil, table: nil) ?? key }
    for (name, value) in values { said = said.replacingOccurrences(of: "{\(name)}", with: value) }
    return said
  }

  /// Whether the app's language is written right to left, so the widget's own words line up on the right.
  static func isRightToLeft(_ locale: String) -> Bool {
    locale == "ckb" || locale == "ar"
  }

  /// A letter's date in the app's language: the day and the month, and the year when it is not this one.
  static func date(_ date: Date, locale: String, now: Date = Date()) -> String {
    let calendar = Calendar.current
    var style = Date.FormatStyle.dateTime.day().month(.abbreviated)
    if calendar.component(.year, from: date) != calendar.component(.year, from: now) { style = style.year() }
    return date.formatted(style.locale(Locale(identifier: locale)))
  }
}
