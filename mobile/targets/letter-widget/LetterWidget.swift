import SwiftUI
import UIKit
import WidgetKit

// The home-screen letter widget, on iPhone: the newest letter a pen pal sent,
// or the one chosen to stay, on its own paper.
//
// The picture is the server's (the paper, what was drawn on it, the writer's
// pigeon standing in the lower corner away from where the writing starts);
// the words are set over it here, in the phone's own type, so Kurmancî and
// Soranî shape as they do everywhere else on the phone, right to left when
// the letter is. Small, medium and large, and four other faces: sealed (the
// words turned off in the app: the paper and who it is from), no letter yet
// (your own pigeon waiting on the windowsill), signed out ("Open Hevalo to
// see your letters"), and nothing fetched yet with the phone offline.
// Offline after that, it keeps the last letter it had. A tap opens the
// correspondence in the app.
//
// The app makes the widget's token and asks for a reload when something
// changes (mobile/src/widget); the timeline asks again when the feed says to.

@main
struct HevaloWidgets: WidgetBundle {
  var body: some Widget {
    LetterWidget()
  }
}

struct LetterWidget: Widget {
  /// The kind the app names when it asks for a reload (src/widget/contract.ts `WIDGET_KIND`).
  let kind = "LetterWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LetterProvider()) { entry in
      LetterWidgetView(entry: entry)
    }
    // in the phone's list of widgets, in the phone's own language (<lang>.lproj/Localizable.strings)
    .configurationDisplayName(Text("name"))
    .description(Text("description"))
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    // the paper runs to the widget's edges; the words keep their own margin
    .contentMarginsDisabled()
  }
}

// MARK: - The timeline

struct LetterEntry: TimelineEntry {
  enum Shows {
    case letter(WidgetLetter, pinned: Bool, showWords: Bool)
    /// no pen pal has written yet
    case empty
    /// no token on this phone, or the server refused it
    case signedOut
    /// signed in, nothing fetched yet, and nothing kept from before
    case waiting
    /// a parent turned letters off for this teen
    case switchedOff
  }

  let date: Date
  let shows: Shows
  let picture: UIImage?
  let locale: String

  /// The widget in the phone's list of widgets, and while its first entry is on the way: a sealed letter on cream paper.
  static func sample(locale: String) -> LetterEntry {
    let letter = WidgetLetter(
      id: "sample",
      threadId: "",
      from: .init(name: "Hevalo", bird: 0),
      excerpt: "",
      sentAt: ISO8601DateFormatter().string(from: Date()),
      paper: LetterPaper(style: "lined", tone: "cream", ink: "navy"),
      rtl: false,
      drawn: false
    )
    return LetterEntry(date: Date(), shows: .letter(letter, pinned: false, showWords: false), picture: nil, locale: locale)
  }
}

struct LetterProvider: TimelineProvider {
  func placeholder(in context: Context) -> LetterEntry {
    .sample(locale: Shared.locale)
  }

  func getSnapshot(in context: Context, completion: @escaping (LetterEntry) -> Void) {
    // the list of widgets wants an answer at once, and shows nobody's letter
    if context.isPreview {
      completion(.sample(locale: Shared.locale))
      return
    }
    Task {
      completion(await LetterLoader.load(size: context.displaySize).entry)
    }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<LetterEntry>) -> Void) {
    Task {
      let loaded = await LetterLoader.load(size: context.displaySize)
      completion(Timeline(entries: [loaded.entry], policy: .after(loaded.next)))
    }
  }
}

enum LetterLoader {
  /// What the widget shows now, and when to ask again.
  static func load(size: CGSize, now: Date = Date(), retried: Bool = false) async -> (entry: LetterEntry, next: Date) {
    guard let config = WidgetConfig.read() else {
      Keeper.clear()
      return (LetterEntry(date: now, shows: .signedOut, picture: nil, locale: Shared.locale), now.addingTimeInterval(Refresh.signedOutSeconds))
    }
    var kept = Keeper.read()
    // somebody else's letter, from before a sign-out: not a word of it is shown
    if let before = kept, before.owner != config.owner {
      Keeper.clear()
      kept = nil
    }
    var next = now.addingTimeInterval(Refresh.offlineSeconds)
    switch await FeedOnce.shared.answer(config) {
    case .feed(let feed):
      let fresh = Kept(owner: config.owner, feed: feed, fetchedAt: now, pictures: kept?.pictures ?? [:])
      Keeper.write(fresh)
      kept = fresh
      next = now.addingTimeInterval(Refresh.seconds(feed.refreshAfter))
    case .rejected:
      // the app may have made a new token while this one was being refused (it replaces the old as it starts): ask once more with it
      if !retried, let current = WidgetConfig.read(), current.token != config.token {
        return await load(size: size, now: now, retried: true)
      }
      Shared.markRejected()
      Keeper.clear()
      return (LetterEntry(date: now, shows: .signedOut, picture: nil, locale: config.locale), now.addingTimeInterval(Refresh.signedOutSeconds))
    case .switchedOff:
      // no letter is shown while letters are off, not even the last one; the token stays
      Keeper.clear()
      return (LetterEntry(date: now, shows: .switchedOff, picture: nil, locale: config.locale), now.addingTimeInterval(Refresh.switchedOffSeconds))
    case .later(let wait):
      next = now.addingTimeInterval(wait)
    case .offline:
      // the last letter stays, and the widget asks again soon
      break
    }
    guard let held = kept else {
      return (LetterEntry(date: now, shows: .waiting, picture: nil, locale: config.locale), next)
    }
    let feed = held.feed
    // an empty sill's sky follows the phone's clock
    if feed.letter == nil { next = min(next, Sky.nextChange(after: now)) }
    let picture = await fetchPicture(for: feed, config: config, size: size, now: now, kept: held)
    let shows: LetterEntry.Shows
    if let letter = feed.letter {
      shows = .letter(letter, pinned: feed.pinned, showWords: feed.showWords)
    } else {
      shows = .empty
    }
    return (LetterEntry(date: now, shows: shows, picture: picture, locale: config.locale), next)
  }

  /// The picture for this size: the one kept when it is of the same thing, else fetched. Nil rather than another letter's paper.
  private static func fetchPicture(for feed: WidgetFeed, config: WidgetConfig, size: CGSize, now: Date, kept: Kept) async -> UIImage? {
    let scale = await MainActor.run { UIScreen.main.scale }
    let query = PictureSize.query(for: size, scale: scale)
    let key = "\(query.w)x\(query.h)@\(query.scale)"
    let sky = Sky.at(now)
    // the writer may choose another pigeon for a letter already sent, and the picture shows it
    let subject = feed.letter.map { "letter:\($0.id):\($0.from.bird)" } ?? "empty:\(sky)"
    if kept.pictures[key] == subject, let data = Keeper.picture(key), let image = UIImage(data: data) {
      return image
    }
    guard let data = await LetterAPI.picture(config, size: size, scale: scale, sky: sky), let image = UIImage(data: data) else {
      return nil
    }
    var updated = kept
    updated.pictures[key] = subject
    Keeper.keep(picture: data, key: key)
    Keeper.write(updated)
    return image
  }
}

// MARK: - The faces

struct LetterWidgetView: View {
  let entry: LetterEntry

  var body: some View {
    switch entry.shows {
    case .letter(let letter, let pinned, let showWords):
      LetterOnPaper(letter: letter, pinned: pinned, showWords: showWords, picture: entry.picture, locale: entry.locale)
    case .empty:
      EmptySill(picture: entry.picture, locale: entry.locale)
    case .signedOut:
      Plain(text: Words.text("signedOut", locale: entry.locale), link: "hevalo://")
    case .waiting:
      Plain(text: Words.text("waiting", locale: entry.locale), link: "hevalo://app/letters")
    case .switchedOff:
      Plain(text: Words.text("off", locale: entry.locale), link: "hevalo://")
    }
  }
}

/// The paper under the words: its colour, and the server's picture of it once there is one.
struct PaperBackground: View {
  let sheet: String
  let picture: UIImage?

  var body: some View {
    ZStack {
      Color(hex: sheet)
      if let picture {
        Image(uiImage: picture)
          .resizable()
          .scaledToFill()
      }
    }
  }
}

struct LetterOnPaper: View {
  @Environment(\.widgetFamily) private var family
  let letter: WidgetLetter
  let pinned: Bool
  let showWords: Bool
  let picture: UIImage?
  let locale: String

  private var sealed: Bool {
    !showWords || letter.excerpt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private var link: URL? {
    let thread = letter.threadId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? letter.threadId
    return URL(string: thread.isEmpty ? "hevalo://app/letters" : "hevalo://app/letters/\(thread)")
  }

  var body: some View {
    let sheet = PaperColors.sheet(tone: letter.paper?.tone)
    let ink = PaperColors.ink(tone: letter.paper?.tone, ink: letter.paper?.ink)
    // the same paper, a little see-through, so a drawing under the words never makes them hard to read
    let wash = Color(hex: sheet.sheet).opacity(0.9)
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 2) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          // who wrote, and below what they wrote, are hidden while the phone is locked (StandBy, the Lock Screen)
          Text(sealed ? Words.text("sealed", locale: locale, ["name": letter.from.name]) : letter.from.name)
            .font(.system(size: family == .systemSmall ? 14 : 15, weight: sealed ? .semibold : .bold))
            .lineLimit(sealed ? 3 : 1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .privacySensitive()
          if pinned {
            Image(systemName: "pin.fill")
              .font(.system(size: 11, weight: .semibold))
              .accessibilityLabel(Text(Words.text("pinned", locale: locale)))
          }
        }
        if !sealed {
          Text(letter.excerpt)
            .font(.system(size: family == .systemLarge ? 15 : 13))
            .lineSpacing(family == .systemLarge ? 4 : 2)
            .lineLimit(family == .systemLarge ? 7 : 3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .privacySensitive()
        }
      }
      .padding(6)
      .background(wash, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      // a wide widget's words stop short of the corner the pigeon stands in (trailing: the left for a letter written right to left)
      .padding(.trailing, family == .systemMedium ? 80 : 0)
      Spacer(minLength: 4)
      if let sent = letterDate(letter.sentAt) {
        Text(Words.date(sent, locale: locale))
          .font(.system(size: 11))
          .foregroundStyle(Color(hex: ink.muted))
          .padding(.horizontal, 5)
          .padding(.vertical, 1)
          .background(wash, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
      }
    }
    .foregroundStyle(Color(hex: ink.ink))
    .padding(10)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .accessibilityElement(children: .combine)
    .environment(\.layoutDirection, letter.rtl ? .rightToLeft : .leftToRight)
    .widgetURL(link)
    .containerBackground(for: .widget) {
      PaperBackground(sheet: sheet.sheet, picture: picture)
    }
  }
}

struct EmptySill: View {
  @Environment(\.widgetFamily) private var family
  let picture: UIImage?
  let locale: String

  var body: some View {
    let sheet = PaperColors.fallback
    let ink = PaperColors.ink(tone: "cream", ink: "navy")
    VStack(alignment: .leading, spacing: 2) {
      Text(Words.text("empty", locale: locale))
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(Color(hex: ink.ink))
      if family != .systemSmall {
        Text(Words.text("emptyMore", locale: locale))
          .font(.system(size: 12))
          .foregroundStyle(Color(hex: ink.muted))
          .lineLimit(2)
      }
    }
    .padding(6)
    .background(Color(hex: sheet.sheet).opacity(0.9), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    .padding(10)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .accessibilityElement(children: .combine)
    .environment(\.layoutDirection, Words.isRightToLeft(locale) ? .rightToLeft : .leftToRight)
    .widgetURL(URL(string: "hevalo://app/letters"))
    .containerBackground(for: .widget) {
      PaperBackground(sheet: sheet.sheet, picture: picture)
    }
  }
}

/// Signed out, or nothing to show yet: the app's way in, in the phone's own colours.
struct Plain: View {
  let text: String
  let link: String

  var body: some View {
    VStack(spacing: 8) {
      Image(systemName: "envelope")
        .font(.system(size: 26))
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      Text(text)
        .font(.system(size: 14, weight: .semibold))
        .multilineTextAlignment(.center)
        .lineLimit(3)
        .minimumScaleFactor(0.85)
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .widgetURL(URL(string: link))
    .containerBackground(for: .widget) {
      Color(uiColor: .systemBackground)
    }
  }
}
