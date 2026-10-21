import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../config.dart';
import 'google_desktop_stub.dart' if (dart.library.io) 'google_desktop_io.dart' as desktop;

/// Produces the payload POSTed to /api/auth/google/ on every platform:
///   Android / iOS / web → {"id_token": ...}
///   Windows / Linux     → {"code": ..., "code_verifier": ..., "redirect_uri": ...}
class GoogleAuth {
  GoogleAuth() {
    if (usesPlugin) {
      _plugin = GoogleSignIn(
        scopes: const ['email', 'profile'],
        clientId: kIsWeb
            ? AppConfig.googleWebClientId
            : (defaultTargetPlatform == TargetPlatform.iOS && AppConfig.googleIosClientId.isNotEmpty
                ? AppConfig.googleIosClientId
                : null),
        serverClientId: kIsWeb || AppConfig.googleWebClientId.isEmpty ? null : AppConfig.googleWebClientId,
      );
    }
  }

  GoogleSignIn? _plugin;

  static bool get usesPlugin =>
      kIsWeb ||
      defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS ||
      defaultTargetPlatform == TargetPlatform.macOS;

  /// Web only: fires after the user completes the rendered Google button.
  Stream<Map<String, String>> get webSignIns => (_plugin?.onCurrentUserChanged ?? const Stream.empty())
      .where((account) => account != null)
      .asyncMap((account) async => {'id_token': (await account!.authentication).idToken ?? ''})
      .where((payload) => payload['id_token']!.isNotEmpty);

  /// Mobile and desktop: run the interactive sign-in. Returns null if cancelled.
  Future<Map<String, String>?> signIn() async {
    if (!usesPlugin) {
      if (AppConfig.googleDesktopClientId.isEmpty) {
        throw Exception('GOOGLE_DESKTOP_CLIENT_ID is not configured for this build.');
      }
      return desktop.signInWithGoogleDesktop(AppConfig.googleDesktopClientId);
    }
    final account = await _plugin!.signIn();
    if (account == null) return null;
    final idToken = (await account.authentication).idToken;
    if (idToken == null) throw Exception('Google did not return an ID token. Check the OAuth client IDs.');
    return {'id_token': idToken};
  }

  Future<void> signOut() async {
    try {
      await _plugin?.signOut();
    } catch (_) {
      // Signing out of Google is best effort; our own tokens are already gone.
    }
  }
}
