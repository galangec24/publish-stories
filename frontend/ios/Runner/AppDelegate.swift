import Flutter
import UIKit

/// iOS can't block screenshots. It can tell us when the screen is being
/// recorded, mirrored or AirPlayed (we cover the content) and when a
/// screenshot was just taken (we warn the reader).
@main
@objc class AppDelegate: FlutterAppDelegate {
  private var guardChannel: FlutterMethodChannel?
  private var guardEnabled = false

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)
    if let controller = window?.rootViewController as? FlutterViewController {
      let channel = FlutterMethodChannel(name: "story_app/screen_guard", binaryMessenger: controller.binaryMessenger)
      channel.setMethodCallHandler { [weak self] call, result in
        guard let self = self else { return }
        switch call.method {
        case "enable":
          self.guardEnabled = true
          self.reportCapture()
          result(nil)
        case "disable":
          self.guardEnabled = false
          result(nil)
        default:
          result(FlutterMethodNotImplemented)
        }
      }
      guardChannel = channel
    }

    NotificationCenter.default.addObserver(
      forName: UIScreen.capturedDidChangeNotification, object: nil, queue: .main
    ) { [weak self] _ in self?.reportCapture() }
    NotificationCenter.default.addObserver(
      forName: UIApplication.userDidTakeScreenshotNotification, object: nil, queue: .main
    ) { [weak self] _ in
      guard let self = self, self.guardEnabled else { return }
      self.guardChannel?.invokeMethod("screenshotTaken", arguments: nil)
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  private func reportCapture() {
    guard guardEnabled else { return }
    guardChannel?.invokeMethod("captureChanged", arguments: UIScreen.main.isCaptured)
  }
}
