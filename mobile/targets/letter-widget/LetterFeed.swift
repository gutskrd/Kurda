import CryptoKit
import Foundation
import UIKit

// What the widget asks the server, with what the app left it, and what it
// keeps of the answers for when the phone is offline.
//
// The app leaves three things in the App Group it shares with this extension
// (src/widget/storage.ts): this phone's widget token, the server it belongs
// to, and the language the app is in. The names are the app's own
// (src/widget/contract.ts `WIDGET_KEYS`); mobile/src/widget/widget.test.ts
// reads this file to hold the two to the same spelling. The token goes only
// in the Authorization header of the widget's own two requests.

enum Shared {
  static let appGroup = "group.app.hevalo.mobile"
  static let tokenKey = "letterWidget.token"
  static let apiBaseKey = "letterWidget.apiBase"
  static let localeKey = "letterWidget.locale"
  static let rejectedKey = "letterWidget.rejected"

  static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

  /// The language the app is in, which need not be the phone's: the widget speaks it too.
  static var locale: String { defaults?.string(forKey: localeKey) ?? "en" }

  /// Tell the app the server refused the token, so it makes a new one next time it is open.
  static func markRejected() {
    defaults?.set("1", forKey: rejectedKey)
  }
}

struct WidgetConfig {
  let token: String
  let apiBase: String
  let locale: String

  /// What the app left, or nil when it left nothing to ask with: signed out, or no token yet.
  static func read() -> WidgetConfig? {
    guard let defaults = Shared.defaults,
          let token = defaults.string(forKey: Shared.tokenKey), !token.isEmpty,
          let apiBase = defaults.string(forKey: Shared.apiBaseKey), !apiBase.isEmpty
    else { return nil }
    return WidgetConfig(token: token, apiBase: apiBase, locale: defaults.string(forKey: Shared.localeKey) ?? "en")
  }

  /// Whose this is, without keeping the token itself beside the letters: what was kept for one account is never shown to the next.
  var owner: String {
    let digest = SHA256.hash(data: Data("\(apiBase) \(token)".utf8))
    return digest.prefix(12).map { String(format: "%02x", $0) }.joined()
  }
}

// MARK: - The feed (shared/src/letter-paper.ts `WidgetFeed`)

struct LetterPaper: Codable, Equatable {
  let style: String
  let tone: String
  let ink: String
}

struct WidgetLetter: Codable, Equatable {
  struct From: Codable, Equatable {
    let name: String
    let bird: Int
  }

  let id: String
  let threadId: String
  let from: From
  let excerpt: String
  let sentAt: String
  let paper: LetterPaper?
  let rtl: Bool
  let drawn: Bool?
}

struct WidgetFeed: Codable, Equatable {
  let letter: WidgetLetter?
  let pinned: Bool
  let showWords: Bool
  let refreshAfter: Double
}

enum FeedAnswer {
  case feed(WidgetFeed)
  /// 401 or 403: the token was taken away (signed out, every widget removed in settings, a new password)
  case rejected
  /// 403 PARENTAL_BLOCKED: a parent turned letters off; the token still holds
  case switchedOff
  /// 429: asked too often this hour
  case later(TimeInterval)
  /// no network, a timeout, the server down or saying something that is not a feed
  case offline
}

enum Refresh {
  /// Never sooner than this whatever a feed says, never later than this either (src/widget/contract.ts).
  static let minSeconds: TimeInterval = 5 * 60
  static let maxSeconds: TimeInterval = 12 * 60 * 60
  static let offlineSeconds: TimeInterval = 15 * 60
  static let signedOutSeconds: TimeInterval = 6 * 60 * 60
  /// letters switched off by a parent: asked again within the hour, in case they are back on
  static let switchedOffSeconds: TimeInterval = 60 * 60

  static func seconds(_ refreshAfter: Double) -> TimeInterval {
    guard refreshAfter.isFinite else { return offlineSeconds }
    return min(maxSeconds, max(minSeconds, refreshAfter.rounded()))
  }
}

/// The picture's limits (shared `WIDGET_IMAGE`): each side in points, the density, the longest side in pixels.
enum PictureSize {
  static let minSide: CGFloat = 40
  static let maxSide: CGFloat = 800
  static let maxScale: CGFloat = 4
  static let maxPixels: CGFloat = 1600

  /// The size as the server takes it: whole points, each side within bounds, a density that keeps the longer side inside the pixels it draws.
  static func query(for size: CGSize, scale: CGFloat) -> (w: Int, h: Int, scale: String) {
    let w = min(maxSide, max(minSide, size.width.rounded()))
    let h = min(maxSide, max(minSide, size.height.rounded()))
    let room = maxPixels / max(w, h)
    let s = max(1, (min(maxScale, room, scale > 0 ? scale : 2) * 100).rounded(.down) / 100)
    return (Int(w), Int(h), String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), s))
  }
}

/// The sky the empty windowsill shows at an hour of the phone's clock, as the letters' window does (shared treeSkyAt).
enum Sky {
  static func at(_ date: Date) -> String {
    let hour = Calendar.current.component(.hour, from: date)
    switch hour {
    case 5..<8: return "dawn"
    case 8..<17: return "day"
    case 17..<20: return "dusk"
    default: return "night"
    }
  }

  /// The next hour the sky changes at: an empty widget asks again then, so its window keeps time.
  static func nextChange(after date: Date) -> Date {
    let calendar = Calendar.current
    let hour = calendar.component(.hour, from: date)
    let startOfDay = calendar.startOfDay(for: date)
    let next = [5, 8, 17, 20].first { $0 > hour }
    if let next, let at = calendar.date(byAdding: .hour, value: next, to: startOfDay) { return at }
    let tomorrow = calendar.date(byAdding: .day, value: 1, to: startOfDay) ?? date.addingTimeInterval(86_400)
    return calendar.date(byAdding: .hour, value: 5, to: tomorrow) ?? tomorrow
  }
}

enum LetterAPI {
  private static let session: URLSession = {
    let configuration = URLSessionConfiguration.default
    // long enough for a server that was asleep to wake, no longer: the system gives a widget little time
    configuration.timeoutIntervalForRequest = 20
    configuration.timeoutIntervalForResource = 25
    configuration.waitsForConnectivity = false
    return URLSession(configuration: configuration)
  }()

  private static func authorized(_ config: WidgetConfig, path: String) -> URLRequest? {
    guard let url = URL(string: config.apiBase + path) else { return nil }
    var request = URLRequest(url: url)
    request.setValue("Widget \(config.token)", forHTTPHeaderField: "Authorization")
    return request
  }

  static func feed(_ config: WidgetConfig) async -> FeedAnswer {
    guard var request = authorized(config, path: "/letters/widget/feed") else { return .offline }
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    do {
      let (data, response) = try await session.data(for: request)
      guard let http = response as? HTTPURLResponse else { return .offline }
      switch http.statusCode {
      case 200:
        guard let feed = try? JSONDecoder().decode(WidgetFeed.self, from: data) else { return .offline }
        return .feed(feed)
      case 403 where refusalCode(data) == "PARENTAL_BLOCKED":
        return .switchedOff
      case 401, 403:
        return .rejected
      case 429:
        let wait = http.value(forHTTPHeaderField: "Retry-After").flatMap(Double.init) ?? Refresh.offlineSeconds
        return .later(max(Refresh.minSeconds, wait))
      default:
        return .offline
      }
    } catch {
      return .offline
    }
  }

  /// The code in a refusal's body, when it has one.
  private static func refusalCode(_ data: Data) -> String? {
    struct Refusal: Decodable { let code: String? }
    return (try? JSONDecoder().decode(Refusal.self, from: data))?.code
  }

  /// The picture of the letter's paper and drawing with its writer's pigeon, or of the empty sill at a sky.
  static func picture(_ config: WidgetConfig, size: CGSize, scale: CGFloat, sky: String) async -> Data? {
    let q = PictureSize.query(for: size, scale: scale)
    guard let request = authorized(config, path: "/letters/widget/image?w=\(q.w)&h=\(q.h)&scale=\(q.scale)&sky=\(sky)") else { return nil }
    do {
      let (data, response) = try await session.data(for: request)
      guard let http = response as? HTTPURLResponse, http.statusCode == 200, UIImage(data: data) != nil else { return nil }
      return data
    } catch {
      return nil
    }
  }
}

/// One feed request at a time, however many widgets are asking at once (one of each size asks for itself).
actor FeedOnce {
  static let shared = FeedOnce()
  private var running: (owner: String, task: Task<FeedAnswer, Never>)?
  private var last: (at: Date, owner: String, answer: FeedAnswer)?

  func answer(_ config: WidgetConfig) async -> FeedAnswer {
    let owner = config.owner
    if let last, last.owner == owner, Date().timeIntervalSince(last.at) < 20 { return last.answer }
    if let running, running.owner == owner { return await running.task.value }
    let task = Task { await LetterAPI.feed(config) }
    running = (owner, task)
    let answer = await task.value
    if running?.owner == owner { running = nil }
    last = (Date(), owner, answer)
    return answer
  }
}

// MARK: - What is kept for when the phone is offline

/// The last feed and the pictures for it, in the App Group's caches, belonging to one token.
struct Kept: Codable {
  let owner: String
  var feed: WidgetFeed
  var fetchedAt: Date
  /// for each picture on disk (by its size), what it is a picture of
  var pictures: [String: String]
}

enum Keeper {
  private static var folder: URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: Shared.appGroup)?
      .appendingPathComponent("Library/Caches/LetterWidget", isDirectory: true)
  }

  static func read() -> Kept? {
    guard let file = folder?.appendingPathComponent("feed.json"), let data = try? Data(contentsOf: file) else { return nil }
    return try? JSONDecoder().decode(Kept.self, from: data)
  }

  static func write(_ kept: Kept) {
    guard let folder, let data = try? JSONEncoder().encode(kept) else { return }
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    try? data.write(to: folder.appendingPathComponent("feed.json"), options: .atomic)
  }

  /// Forget the last letter and its pictures: after a sign-out nothing of it is shown again.
  static func clear() {
    guard let folder else { return }
    try? FileManager.default.removeItem(at: folder)
  }

  static func picture(_ key: String) -> Data? {
    guard let file = folder?.appendingPathComponent("picture-\(key).png") else { return nil }
    return try? Data(contentsOf: file)
  }

  static func keep(picture data: Data, key: String) {
    guard let folder else { return }
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    try? data.write(to: folder.appendingPathComponent("picture-\(key).png"), options: .atomic)
  }
}

/// A letter's date, as the server sends it (an ISO 8601 instant).
func letterDate(_ text: String) -> Date? {
  let withFraction = ISO8601DateFormatter()
  withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  if let date = withFraction.date(from: text) { return date }
  return ISO8601DateFormatter().date(from: text)
}
