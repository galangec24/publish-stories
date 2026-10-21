import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_quill/flutter_quill.dart' show FlutterQuillLocalizations;
import 'package:provider/provider.dart';

import 'api/api_client.dart';
import 'screens/genre_onboarding_screen.dart';
import 'screens/home_screen.dart';
import 'state/auth_provider.dart';
import 'state/theme_provider.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final api = ApiClient();
  runApp(MultiProvider(
    providers: [
      Provider.value(value: api),
      ChangeNotifierProvider(create: (_) => AuthProvider(api)..init()),
      ChangeNotifierProvider(create: (_) => ThemeProvider(api)),
    ],
    child: const StoryApp(),
  ));
}

class StoryApp extends StatelessWidget {
  const StoryApp({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = context.watch<ThemeProvider>();
    return MaterialApp(
      title: 'Story Platform',
      debugShowCheckedModeBanner: false,
      theme: theme.theme,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        FlutterQuillLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en'), Locale('fil')],
      home: const RootGate(),
    );
  }
}

/// Guests land on the home screen. Signed-in readers who haven't picked
/// genres yet get onboarding first.
class RootGate extends StatelessWidget {
  const RootGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    if (auth.user != null) {
      // Keep the theme in sync with the account (set on another device, perhaps).
      WidgetsBinding.instance.addPostFrameCallback(
          (_) => context.read<ThemeProvider>().applyFromAccount(auth.user!.theme));
    }
    return switch (auth.status) {
      AuthStatus.unknown => const Scaffold(body: Center(child: CircularProgressIndicator())),
      AuthStatus.signedIn when !auth.user!.onboarded => const GenreOnboardingScreen(),
      _ => const HomeScreen(),
    };
  }
}
