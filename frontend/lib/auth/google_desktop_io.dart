import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:url_launcher/url_launcher.dart';

/// Google sign-in for Windows (the google_sign_in plugin doesn't support it).
///
/// Runs the OAuth 2.0 loopback flow with PKCE: open the system browser, catch
/// the redirect on a throwaway 127.0.0.1 port, and hand the authorization code
/// plus verifier to the backend, which exchanges it with the client secret.
Future<Map<String, String>> signInWithGoogleDesktop(String clientId) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  try {
    final redirectUri = 'http://127.0.0.1:${server.port}/';
    final verifier = _randomString(64);
    final challenge = base64UrlEncode(sha256.convert(ascii.encode(verifier)).bytes).replaceAll('=', '');
    final state = _randomString(24);

    final authUrl = Uri.https('accounts.google.com', '/o/oauth2/v2/auth', {
      'client_id': clientId,
      'redirect_uri': redirectUri,
      'response_type': 'code',
      'scope': 'openid email profile',
      'code_challenge': challenge,
      'code_challenge_method': 'S256',
      'state': state,
      'prompt': 'select_account',
    });
    if (!await launchUrl(authUrl, mode: LaunchMode.externalApplication)) {
      throw Exception('Could not open the browser for Google sign-in.');
    }

    final request = await server.first.timeout(const Duration(minutes: 5));
    final params = request.uri.queryParameters;
    final ok = params['state'] == state && params['code'] != null;
    request.response
      ..statusCode = 200
      ..headers.contentType = ContentType.html
      ..write('<html><body style="font-family:sans-serif;text-align:center;padding-top:80px">'
          '<h2>${ok ? 'Signed in. You can close this window and return to the app.' : 'Sign-in was cancelled.'}</h2>'
          '</body></html>');
    await request.response.close();
    if (!ok) throw Exception(params['error'] ?? 'Google sign-in was cancelled.');
    return {'code': params['code']!, 'code_verifier': verifier, 'redirect_uri': redirectUri};
  } finally {
    await server.close(force: true);
  }
}

String _randomString(int length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  final random = Random.secure();
  return List.generate(length, (_) => chars[random.nextInt(chars.length)]).join();
}
