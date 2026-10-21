import 'package:flutter/material.dart';

import '../api/api_client.dart';

/// Light / Dark / Sepia, stored on the account so every client matches.
class ThemeProvider extends ChangeNotifier {
  ThemeProvider(this.api);

  final ApiClient api;
  String themeName = 'light';

  static const options = {'light': 'Light', 'dark': 'Dark', 'sepia': 'Sepia'};

  /// Apply the value from /api/user/me/ without writing it back.
  void applyFromAccount(String name) {
    if (name == themeName || !options.containsKey(name)) return;
    themeName = name;
    notifyListeners();
  }

  /// Change locally right away, then persist for signed-in users.
  Future<void> setTheme(String name, {required bool signedIn}) async {
    themeName = name;
    notifyListeners();
    if (signedIn) await api.put('user/theme/', {'theme_name': name});
  }

  ThemeData get theme => switch (themeName) {
        'dark' => ThemeData(colorSchemeSeed: const Color(0xFF7E57C2), brightness: Brightness.dark, useMaterial3: true),
        'sepia' => _sepia,
        _ => ThemeData(colorSchemeSeed: const Color(0xFF6750A4), useMaterial3: true),
      };

  static final _sepia = () {
    const paper = Color(0xFFF4ECD8);
    const ink = Color(0xFF5B4636);
    final scheme = ColorScheme.fromSeed(seedColor: const Color(0xFF8D6E63)).copyWith(
      surface: paper,
      onSurface: ink,
      surfaceContainerLowest: const Color(0xFFFBF5E6),
      surfaceContainerLow: const Color(0xFFEFE5CC),
      surfaceContainer: const Color(0xFFEADFC4),
    );
    return ThemeData(colorScheme: scheme, scaffoldBackgroundColor: paper, useMaterial3: true);
  }();

  /// The editor and reader draw a "page"; keep it paper-like in light and sepia.
  Color get pageColor => switch (themeName) {
        'dark' => const Color(0xFF1E1E1E),
        'sepia' => const Color(0xFFFBF5E6),
        _ => Colors.white,
      };
}
