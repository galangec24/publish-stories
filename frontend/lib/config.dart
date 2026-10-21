/// Build-time configuration. Pass values with --dart-define, e.g.
///
///   flutter run -d chrome \
///     --dart-define=API_BASE_URL=http://localhost:8000/api \
///     --dart-define=GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
class AppConfig {
  static const apiBaseUrl =
      String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:8000/api');

  /// Web OAuth client. Also used as `serverClientId` on Android/iOS so the
  /// ID token's audience is a client the backend trusts.
  static const googleWebClientId = String.fromEnvironment('GOOGLE_WEB_CLIENT_ID');
  static const googleIosClientId = String.fromEnvironment('GOOGLE_IOS_CLIENT_ID');

  /// "Desktop app" OAuth client used by the Windows loopback + PKCE flow.
  static const googleDesktopClientId = String.fromEnvironment('GOOGLE_DESKTOP_CLIENT_ID');
}
