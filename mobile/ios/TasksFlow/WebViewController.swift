import Network
import SafariServices
import UIKit
import UserNotifications
import WebKit
import os

/// Кабинет tasksflow.ru в WKWebView и всё, чего голый WebView не умеет:
/// офлайн-экран с автоповтором, alert/confirm страницы, скачивание CSV через
/// «Поделиться», внешние ссылки в Safari, цвет статус-бара по theme-color,
/// push через APNs и тактильный отклик по запросу страницы.
final class WebViewController: UIViewController {
    private let startURL: URL
    private var webView: WKWebView!
    private let splash = SplashView()
    private let offline = OfflineView()
    private let progressBar = UIProgressView(progressViewStyle: .bar)
    private let pathMonitor = NWPathMonitor()
    private var networkAvailable = true
    private var failedURL: URL?
    private var splashHiding = false
    private var observations: [NSKeyValueObservation] = []
    private var downloadTargets: [ObjectIdentifier: URL] = [:]
    private var pushReplies: [(Any?, String?) -> Void] = []
    private var statusBarStyle: UIStatusBarStyle = .lightContent
    private let log = Logger(subsystem: "ru.tasksflow.app", category: "web")

    init(startURL: URL) {
        self.startURL = startURL
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override var preferredStatusBarStyle: UIStatusBarStyle { statusBarStyle }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(named: "LaunchBackground")
        setUpWebView()
        setUpOverlays()
        startNetworkMonitor()
        load(startURL)
        // Медленная сеть: через 6 с показываем страницу как есть (там скелетон и полоса загрузки).
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in self?.hideSplash() }
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        applyThemeColor(webView?.themeColor)
    }

    /// Открыть свою страницу (из push, universal link).
    func open(_ url: URL) {
        offline.isHidden = true
        load(url)
    }

    // MARK: Setup

    private func setUpWebView() {
        let contentController = WKUserContentController()
        contentController.addUserScript(
            WKUserScript(source: Self.bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        contentController.addScriptMessageHandler(WeakMessageHandler(self), contentWorld: .page, name: "tasksflow")

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        // По этой метке сайт понимает, что открыт в приложении.
        configuration.applicationNameForUserAgent = "Mobile/15E148 TasksFlowApp/\(AppConfig.version)"

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(named: "PageBackground")
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
        view.addSubview(webView)
        // Сверху и по бокам — до безопасной зоны (там цвет шапки страницы),
        // снизу — до края: отступ под полоску «Домой» страница делает сама.
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        self.webView = webView

        observations = [
            webView.observe(\.estimatedProgress, options: [.new]) { [weak self] webView, _ in
                self?.updateProgress(webView.estimatedProgress)
            },
            webView.observe(\.themeColor, options: [.initial, .new]) { [weak self] webView, _ in
                self?.applyThemeColor(webView.themeColor)
            },
        ]
    }

    private func setUpOverlays() {
        progressBar.translatesAutoresizingMaskIntoConstraints = false
        progressBar.progressTintColor = UIColor.white.withAlphaComponent(0.85)
        progressBar.trackTintColor = .clear
        progressBar.alpha = 0
        view.addSubview(progressBar)

        offline.translatesAutoresizingMaskIntoConstraints = false
        offline.isHidden = true
        offline.onRetry = { [weak self] in self?.retry() }
        view.addSubview(offline)

        splash.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(splash)

        for overlay in [offline, splash] as [UIView] {
            NSLayoutConstraint.activate([
                overlay.topAnchor.constraint(equalTo: view.topAnchor),
                overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
                overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            ])
        }
        NSLayoutConstraint.activate([
            progressBar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            progressBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progressBar.heightAnchor.constraint(equalToConstant: 2),
        ])
    }

    private func startNetworkMonitor() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                guard let self else { return }
                let available = path.status == .satisfied
                let restored = available && !self.networkAvailable
                self.networkAvailable = available
                if restored && !self.offline.isHidden { self.retry() }
            }
        }
        pathMonitor.start(queue: DispatchQueue(label: "ru.tasksflow.app.network"))
    }

    // MARK: Loading

    private func load(_ url: URL) {
        failedURL = nil
        webView.load(URLRequest(url: url))
    }

    private func retry() {
        offline.isHidden = true
        load(failedURL ?? webView.url ?? startURL)
    }

    private func handleFailure(_ error: Error) {
        setProgressVisible(false)
        let nsError = error as NSError
        // Новая загрузка поверх старой и уход в скачивание — не ошибки.
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
        if nsError.domain == "WebKitErrorDomain" && nsError.code == 102 { return }
        log.error("load failed: \(nsError.domain, privacy: .public) \(nsError.code)")
        failedURL = (nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? webView.url ?? startURL
        let networkCodes = [
            NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut,
            NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed,
            NSURLErrorInternationalRoamingOff, NSURLErrorDataNotAllowed,
        ]
        offline.show(detail: networkCodes.contains(nsError.code) ? nil : nsError.localizedDescription)
        offline.isHidden = false
        hideSplash()
    }

    private func hideSplash() {
        guard splash.superview != nil, !splashHiding else { return }
        splashHiding = true
        let duration = UIAccessibility.isReduceMotionEnabled ? 0 : 0.25
        UIView.animate(withDuration: duration, animations: { self.splash.alpha = 0 }) { _ in
            self.splash.removeFromSuperview()
        }
    }

    private func setProgressVisible(_ visible: Bool) {
        UIView.animate(withDuration: 0.2, animations: { self.progressBar.alpha = visible ? 1 : 0 }) { _ in
            if !visible { self.progressBar.setProgress(0, animated: false) }
        }
    }

    private func updateProgress(_ value: Double) {
        progressBar.setProgress(Float(value), animated: Float(value) > progressBar.progress)
    }

    // Цвет под статус-баром — theme-color страницы; значки — контрастные к нему.
    private func applyThemeColor(_ color: UIColor?) {
        let base = color ?? UIColor(named: "LaunchBackground") ?? .systemIndigo
        view.backgroundColor = base
        let style: UIStatusBarStyle = base.isLight(in: traitCollection) ? .darkContent : .lightContent
        if style != statusBarStyle {
            statusBarStyle = style
            setNeedsStatusBarAppearanceUpdate()
        }
    }

    // MARK: Presenting

    /// Показать поверх всего, что уже открыто; если некуда — fallback, чтобы
    /// WebKit всегда получил ответ на alert/confirm.
    private func presentPanel(_ controller: UIViewController, otherwise fallback: () -> Void) {
        var top: UIViewController = self
        while let presented = top.presentedViewController { top = presented }
        guard top.viewIfLoaded?.window != nil, !top.isBeingDismissed else {
            fallback()
            return
        }
        top.present(controller, animated: true)
    }

    private func openExternally(_ url: URL) {
        let scheme = url.scheme?.lowercased()
        if scheme == "http" || scheme == "https" {
            let safari = SFSafariViewController(url: url)
            safari.preferredControlTintColor = UIColor(named: "AccentColor")
            presentPanel(safari) { UIApplication.shared.open(url) }
        } else {
            // tel:, mailto:, tg: и прочее — системе.
            UIApplication.shared.open(url)
        }
    }

    // MARK: Push

    private func pushStatus(_ reply: @escaping (Any?, String?) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let permission: String
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral: permission = "granted"
            case .denied: permission = "denied"
            default: permission = "default"
            }
            DispatchQueue.main.async {
                reply([
                    "permission": permission,
                    "token": UserDefaults.standard.string(forKey: "apnsToken") ?? "",
                    "environment": AppConfig.apnsEnvironment,
                ], nil)
            }
        }
    }

    private func registerForPush(_ reply: @escaping (Any?, String?) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            DispatchQueue.main.async {
                guard granted else {
                    reply(nil, error?.localizedDescription ?? "denied")
                    return
                }
                self.pushReplies.append(reply)
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func pushDidRegister(token: String) {
        UserDefaults.standard.set(token, forKey: "apnsToken")
        let replies = pushReplies
        pushReplies.removeAll()
        let value: [String: String] = ["token": token, "environment": AppConfig.apnsEnvironment]
        replies.forEach { $0(value, nil) }
    }

    func pushDidFail(_ message: String) {
        log.error("push registration failed: \(message, privacy: .public)")
        let replies = pushReplies
        pushReplies.removeAll()
        replies.forEach { $0(nil, message) }
    }

    private func haptic(_ style: String?) {
        switch style {
        case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "error": UINotificationFeedbackGenerator().notificationOccurred(.error)
        default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    /// window.TasksFlowNative.call(type, payload) → Promise с ответом приложения.
    private static let bridgeScript = """
    (function () {
      if (window.TasksFlowNative) return;
      var handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.tasksflow;
      if (!handler) return;
      window.TasksFlowNative = Object.freeze({
        platform: 'ios',
        version: '\(AppConfig.version)',
        call: function (type, payload) {
          return handler.postMessage(Object.assign({ type: type }, payload || {}));
        }
      });
      document.documentElement.setAttribute('data-native-app', 'ios');
    })();
    """
}

// MARK: - WKNavigationDelegate

extension WebViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        let scheme = url.scheme?.lowercased() ?? ""
        if ["about", "blob", "data"].contains(scheme) || AppConfig.isAppURL(url) {
            decisionHandler(.allow)
            return
        }
        // Встроенные фреймы (видео в статьях) — как есть, переходы — наружу.
        if let frame = navigationAction.targetFrame, !frame.isMainFrame {
            decisionHandler(.allow)
            return
        }
        decisionHandler(.cancel)
        openExternally(url)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if let response = navigationResponse.response as? HTTPURLResponse,
           let disposition = response.value(forHTTPHeaderField: "Content-Disposition"),
           disposition.lowercased().hasPrefix("attachment") {
            decisionHandler(.download)
            return
        }
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        setProgressVisible(true)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        setProgressVisible(false)
        offline.isHidden = true
        hideSplash()
        if let url = webView.url {
            log.notice("tf-loaded \(url.absoluteString, privacy: .public)")
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleFailure(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleFailure(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        log.error("web content process terminated, reloading")
        if webView.url != nil { webView.reload() } else { load(startURL) }
    }
}

// MARK: - WKUIDelegate

extension WebViewController: WKUIDelegate {
    // target="_blank" и window.open: свои страницы — здесь же, чужие — в Safari.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            if AppConfig.isAppURL(url) { webView.load(navigationAction.request) } else { openExternally(url) }
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        presentPanel(alert) { completionHandler() }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        presentPanel(alert) { completionHandler(false) }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text)
        })
        presentPanel(alert) { completionHandler(nil) }
    }
}

// MARK: - WKDownloadDelegate

extension WebViewController: WKDownloadDelegate {
    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            completionHandler(nil)
            return
        }
        let target = folder.appendingPathComponent(suggestedFilename.isEmpty ? "tasksflow-file" : suggestedFilename)
        downloadTargets[ObjectIdentifier(download)] = target
        completionHandler(target)
    }

    // Готовый файл (выгрузка CSV) — в «Поделиться»: Файлы, почта, мессенджер.
    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloadTargets.removeValue(forKey: ObjectIdentifier(download)) else { return }
        let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        if let popover = share.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        presentPanel(share) {}
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloadTargets.removeValue(forKey: ObjectIdentifier(download))
        let alert = UIAlertController(title: "Не удалось скачать файл", message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        presentPanel(alert) {}
    }
}

// MARK: - Мост для страницы

extension WebViewController: WKScriptMessageHandlerWithReply {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        // Только свой сайт и только главный фрейм.
        let originHost = message.frameInfo.securityOrigin.host.lowercased()
        guard message.frameInfo.isMainFrame, originHost == AppConfig.host || originHost == "www.\(AppConfig.host)" else {
            replyHandler(nil, "forbidden")
            return
        }
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else {
            replyHandler(nil, "bad message")
            return
        }
        switch type {
        case "app.info":
            replyHandler(["platform": "ios", "version": AppConfig.version, "build": AppConfig.build], nil)
        case "push.status":
            pushStatus(replyHandler)
        case "push.register":
            registerForPush(replyHandler)
        case "haptic":
            haptic(body["style"] as? String)
            replyHandler(true, nil)
        default:
            replyHandler(nil, "unknown message: \(type)")
        }
    }
}

/// WKUserContentController держит обработчик сильно — разрываем цикл.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandlerWithReply {
    private weak var target: WKScriptMessageHandlerWithReply?

    init(_ target: WKScriptMessageHandlerWithReply) {
        self.target = target
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let target else {
            replyHandler(nil, "unavailable")
            return
        }
        target.userContentController(userContentController, didReceive: message, replyHandler: replyHandler)
    }
}

private extension UIColor {
    func isLight(in traits: UITraitCollection) -> Bool {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        guard resolvedColor(with: traits).getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return false }
        return 0.299 * red + 0.587 * green + 0.114 * blue > 0.62
    }
}
