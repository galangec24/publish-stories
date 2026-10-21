import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../auth/google_auth.dart';

enum AuthStatus { unknown, signedOut, signedIn }

class EmailNotVerified implements Exception {
  EmailNotVerified(this.email);
  final String email;
}

class AuthProvider extends ChangeNotifier {
  AuthProvider(this.api) {
    api.onSessionExpired = () {
      user = null;
      status = AuthStatus.signedOut;
      notifyListeners();
    };
    _webGoogle = google.webSignIns.listen((payload) => _finishGoogle(payload).catchError((_) {}));
  }

  final ApiClient api;
  final google = GoogleAuth();
  StreamSubscription<Map<String, String>>? _webGoogle;

  AuthStatus status = AuthStatus.unknown;
  AppUser? user;

  /// Set when web Google sign-in fails, so the login screen can show it.
  String? lastError;

  bool get isSignedIn => status == AuthStatus.signedIn;
  bool get isAdmin => user?.isAdmin ?? false;

  Future<void> init() async {
    await api.loadTokens();
    if (api.hasSession) {
      try {
        await refreshMe();
        return;
      } on ApiException {
        await api.clearTokens();
      } catch (_) {
        // Offline: keep the tokens, show the signed-out home for now.
      }
    }
    status = AuthStatus.signedOut;
    notifyListeners();
  }

  Future<void> refreshMe() async {
    user = AppUser.fromJson(await api.get('user/me/') as Map<String, dynamic>);
    status = AuthStatus.signedIn;
    notifyListeners();
  }

  Future<void> _acceptTokens(dynamic data) async {
    final map = data as Map<String, dynamic>;
    await api.saveTokens(map['access'] as String, map['refresh'] as String);
    user = AppUser.fromJson(map['user'] as Map<String, dynamic>);
    status = AuthStatus.signedIn;
    lastError = null;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    try {
      await _acceptTokens(await api.post('auth/login/', {'email': email, 'password': password}));
    } on ApiException catch (e) {
      if (e.code == 'email_not_verified') throw EmailNotVerified(email);
      rethrow;
    }
  }

  /// Creates the account; Brevo emails a code. Follow with [verifyEmail].
  Future<void> register(String email, String password, String displayName) =>
      api.post('auth/register/', {'email': email, 'password': password, 'display_name': displayName});

  Future<void> verifyEmail(String email, String code) async =>
      _acceptTokens(await api.post('auth/verify-email/', {'email': email, 'code': code}));

  Future<void> resendCode(String email, {String purpose = 'verify_email'}) =>
      api.post('auth/resend-code/', {'email': email, 'purpose': purpose});

  Future<void> requestPasswordReset(String email) => api.post('auth/password/reset/', {'email': email});

  Future<void> confirmPasswordReset(String email, String code, String newPassword) async => _acceptTokens(
      await api.post('auth/password/reset/confirm/', {'email': email, 'code': code, 'new_password': newPassword}));

  /// Interactive Google sign-in for Android, iOS and Windows. Returns false if cancelled.
  Future<bool> signInWithGoogle() async {
    final payload = await google.signIn();
    if (payload == null) return false;
    await _finishGoogle(payload);
    return true;
  }

  Future<void> _finishGoogle(Map<String, String> payload) async {
    try {
      await _acceptTokens(await api.post('auth/google/', payload));
    } on ApiException catch (e) {
      lastError = e.message;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> saveGenres(List<int> genreIds) async {
    await api.put('user/genres/', {'genre_ids': genreIds});
    await refreshMe();
  }

  Future<void> setReadingMode(String mode) async {
    await api.patch('user/me/', {'reading_mode': mode});
    await refreshMe();
  }

  Future<void> logout() async {
    final refresh = api.refreshToken;
    if (refresh != null) {
      try {
        await api.post('auth/logout/', {'refresh': refresh});
      } catch (_) {}
    }
    await api.clearTokens();
    await google.signOut();
    user = null;
    status = AuthStatus.signedOut;
    notifyListeners();
  }

  @override
  void dispose() {
    _webGoogle?.cancel();
    super.dispose();
  }
}
