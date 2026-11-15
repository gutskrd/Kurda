import SwiftUI

// The colours of a letter's paper, for the words the widget sets over it.
//
// The picture under the words is drawn by the server from the shared paper
// art, and the words are the writer's own ink on it, as in the app. Those
// colours come from shared/src/letter-paper.ts (`paperColors`), which this
// program cannot run, so they are written out here: the sheet of each tone,
// and each ink as it reads on that sheet, with the quieter colour the date is
// set in. mobile/src/widget/widget.test.ts works them out again from the
// shared code and fails if a single one has drifted.

struct Ink {
  let ink: String
  let muted: String
}

struct Sheet {
  let sheet: String
  let inks: [String: Ink]
}

enum PaperColors {
  static let byTone: [String: Sheet] = [
    "cream": Sheet(
      sheet: "#fbf3e1",
      inks: [
        "navy": Ink(ink: "#1f3a6e", muted: "#77849c"),
        "charcoal": Ink(ink: "#34373d", muted: "#84827f"),
        "sepia": Ink(ink: "#6a4322", muted: "#9a8167"),
        "forest": Ink(ink: "#2a5938", muted: "#768e75"),
        "crimson": Ink(ink: "#9e2230", muted: "#c37677"),
        "plum": Ink(ink: "#5c2a63", muted: "#9c7a95"),
        "teal": Ink(ink: "#125d63", muted: "#68908c"),
        "gold": Ink(ink: "#7d5810", muted: "#9a8458"),
      ]
    ),
    "white": Sheet(
      sheet: "#fcfcf9",
      inks: [
        "navy": Ink(ink: "#1f3a6e", muted: "#7788a6"),
        "charcoal": Ink(ink: "#34373d", muted: "#848688"),
        "sepia": Ink(ink: "#6a4322", muted: "#a48d78"),
        "forest": Ink(ink: "#2a5938", muted: "#76917d"),
        "crimson": Ink(ink: "#9e2230", muted: "#c47980"),
        "plum": Ink(ink: "#5c2a63", muted: "#9c7e9f"),
        "teal": Ink(ink: "#125d63", muted: "#699495"),
        "gold": Ink(ink: "#7d5810", muted: "#9b8860"),
      ]
    ),
    "rose": Sheet(
      sheet: "#fbeae6",
      inks: [
        "navy": Ink(ink: "#1f3a6e", muted: "#77809e"),
        "charcoal": Ink(ink: "#34373d", muted: "#847f81"),
        "sepia": Ink(ink: "#6a4322", muted: "#9a7e69"),
        "forest": Ink(ink: "#2a5938", muted: "#768a76"),
        "crimson": Ink(ink: "#9e2230", muted: "#c37279"),
        "plum": Ink(ink: "#5c2a63", muted: "#9c7797"),
        "teal": Ink(ink: "#125d63", muted: "#688c8e"),
        "gold": Ink(ink: "#7d5810", muted: "#9a805a"),
      ]
    ),
    "sky": Sheet(
      sheet: "#e9f1f9",
      inks: [
        "navy": Ink(ink: "#1f3a6e", muted: "#7083a6"),
        "charcoal": Ink(ink: "#34373d", muted: "#7c8188"),
        "sepia": Ink(ink: "#6a4322", muted: "#948171"),
        "forest": Ink(ink: "#2a5938", muted: "#6f8d7d"),
        "crimson": Ink(ink: "#9e2230", muted: "#bc7580"),
        "plum": Ink(ink: "#5c2a63", muted: "#947a9f"),
        "teal": Ink(ink: "#125d63", muted: "#628f95"),
        "gold": Ink(ink: "#7d5810", muted: "#948360"),
      ]
    ),
    "sage": Sheet(
      sheet: "#eaf0e1",
      inks: [
        "navy": Ink(ink: "#1f3a6e", muted: "#70839c"),
        "charcoal": Ink(ink: "#34373d", muted: "#7d817f"),
        "sepia": Ink(ink: "#6a4322", muted: "#948067"),
        "forest": Ink(ink: "#2a5938", muted: "#708c75"),
        "crimson": Ink(ink: "#9e2230", muted: "#bc7477"),
        "plum": Ink(ink: "#5c2a63", muted: "#957995"),
        "teal": Ink(ink: "#125d63", muted: "#628f8c"),
        "gold": Ink(ink: "#7d5810", muted: "#958358"),
      ]
    ),
    "lavender": Sheet(
      sheet: "#f0ebf7",
      inks: [
        "navy": Ink(ink: "#1f3a6e", muted: "#7381a5"),
        "charcoal": Ink(ink: "#34373d", muted: "#7f7f87"),
        "sepia": Ink(ink: "#6a4322", muted: "#967e70"),
        "forest": Ink(ink: "#2a5938", muted: "#728a7c"),
        "crimson": Ink(ink: "#9e2230", muted: "#bf7280"),
        "plum": Ink(ink: "#5c2a63", muted: "#97779e"),
        "teal": Ink(ink: "#125d63", muted: "#658d95"),
        "gold": Ink(ink: "#7d5810", muted: "#96815f"),
      ]
    ),
    "kraft": Sheet(
      sheet: "#dcc29b",
      inks: [
        "navy": Ink(ink: "#1f3a6e", muted: "#656978"),
        "charcoal": Ink(ink: "#34373d", muted: "#70685d"),
        "sepia": Ink(ink: "#6a4322", muted: "#7d6143"),
        "forest": Ink(ink: "#2a5938", muted: "#5d6b4f"),
        "crimson": Ink(ink: "#95202d", muted: "#9c554e"),
        "plum": Ink(ink: "#5c2a63", muted: "#866172"),
        "teal": Ink(ink: "#11575d", muted: "#567268"),
        "gold": Ink(ink: "#67480d", muted: "#7b6339"),
      ]
    ),
    "night": Sheet(
      sheet: "#161d33",
      inks: [
        "navy": Ink(ink: "#aec4ff", muted: "#7181ad"),
        "charcoal": Ink(ink: "#e4e7ee", muted: "#9296a3"),
        "sepia": Ink(ink: "#ecc9a2", muted: "#968476"),
        "forest": Ink(ink: "#a6dcb4", muted: "#6c9080"),
        "crimson": Ink(ink: "#ffa3ab", muted: "#a26d7b"),
        "plum": Ink(ink: "#e2b6ec", muted: "#9079a2"),
        "teal": Ink(ink: "#8fded9", muted: "#5f9197"),
        "gold": Ink(ink: "#f3d37c", muted: "#9b8a5f"),
      ]
    ),
  ]

  /// The paper a letter is on when it names none the widget knows: cream, written in navy, as in the app.
  static let fallback = byTone["cream"]!

  static func sheet(tone: String?) -> Sheet {
    byTone[tone ?? ""] ?? fallback
  }

  static func ink(tone: String?, ink: String?) -> Ink {
    let sheet = sheet(tone: tone)
    return sheet.inks[ink ?? ""] ?? sheet.inks["navy"] ?? Ink(ink: "#1f3a6e", muted: "#77849c")
  }
}

extension Color {
  /// A colour written as `#rrggbb`, as the shared paper colours are.
  init(hex: String) {
    let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    let value = UInt32(digits, radix: 16) ?? 0
    self.init(
      .sRGB,
      red: Double((value >> 16) & 0xFF) / 255,
      green: Double((value >> 8) & 0xFF) / 255,
      blue: Double(value & 0xFF) / 255,
      opacity: 1
    )
  }
}
