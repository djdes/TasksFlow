import UIKit

/// Заставка поверх WebView до первой отрисовки страницы — та же, что
/// системный экран запуска (LaunchBackground + LaunchLogo), без белой вспышки.
final class SplashView: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(named: "LaunchBackground")
        let logo = UIImageView(image: UIImage(named: "LaunchLogo"))
        logo.translatesAutoresizingMaskIntoConstraints = false
        addSubview(logo)
        NSLayoutConstraint.activate([
            logo.centerXAnchor.constraint(equalTo: centerXAnchor),
            logo.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityLabel = "TasksFlow загружается"
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}

/// Нет сети или сервер не ответил: понятный текст и повтор. Когда связь
/// вернётся, WebViewController повторит загрузку сам.
final class OfflineView: UIView {
    var onRetry: (() -> Void)?
    private let messageLabel = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .systemBackground

        let icon = UIImageView(image: UIImage(systemName: "wifi.slash"))
        icon.tintColor = .secondaryLabel
        icon.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 44, weight: .regular)
        icon.contentMode = .scaleAspectFit

        let title = UILabel()
        title.text = "Нет соединения"
        title.font = .preferredFont(forTextStyle: .title2)
        title.adjustsFontForContentSizeCategory = true
        title.textAlignment = .center

        messageLabel.text = "TasksFlow откроется сам, когда связь вернётся."
        messageLabel.font = .preferredFont(forTextStyle: .body)
        messageLabel.adjustsFontForContentSizeCategory = true
        messageLabel.textColor = .secondaryLabel
        messageLabel.textAlignment = .center
        messageLabel.numberOfLines = 0

        var config = UIButton.Configuration.filled()
        config.title = "Повторить"
        config.cornerStyle = .large
        config.buttonSize = .large
        let button = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in self?.onRetry?() })

        let stack = UIStackView(arrangedSubviews: [icon, title, messageLabel, button])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 12
        stack.setCustomSpacing(24, after: messageLabel)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: safeAreaLayoutGuide.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: layoutMarginsGuide.trailingAnchor),
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 420),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func show(detail: String?) {
        if let detail, !detail.isEmpty {
            messageLabel.text = "TasksFlow откроется сам, когда связь вернётся.\n\(detail)"
        } else {
            messageLabel.text = "TasksFlow откроется сам, когда связь вернётся."
        }
    }
}
