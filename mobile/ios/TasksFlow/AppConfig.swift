import Foundation

/// Куда смотрит приложение. Хост задаётся в project.yml (TF_HOST → Info.plist),
/// чтобы сборку для стенда можно было сделать без правки кода.
enum AppConfig {
    static let host: String = {
        let value = Bundle.main.object(forInfoDictionaryKey: "TFHost") as? String
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? "tasksflow.ru" : trimmed
    }()

    static var origin: URL { URL(string: "https://\(host)")! }
    static var startURL: URL { URL(string: "https://\(host)/dashboard")! }

    static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
    }

    static var build: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
    }

    /// Сервер различает песочницу и боевой APNs: токены одного не работают в другом.
    static var apnsEnvironment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    /// Свои страницы открываем внутри приложения, всё остальное — снаружи.
    static func isAppURL(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https", let urlHost = url.host?.lowercased() else { return false }
        return urlHost == host || urlHost == "www.\(host)"
    }

    /// Адрес из push или ссылки: относительный путь достраиваем до своего сайта.
    static func appURL(from raw: String) -> URL? {
        guard let url = URL(string: raw, relativeTo: origin)?.absoluteURL, isAppURL(url) else { return nil }
        return url
    }
}
