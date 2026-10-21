import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/auth_provider.dart';
import '../state/theme_provider.dart';
import '../widgets/common.dart';
import 'genre_onboarding_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final theme = context.watch<ThemeProvider>();
    final user = auth.user;
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(children: [
        if (user != null)
          ListTile(
            leading: CircleAvatar(
              backgroundImage: user.avatarUrl.isNotEmpty ? NetworkImage(user.avatarUrl) : null,
              child: user.avatarUrl.isEmpty ? Text(user.label[0].toUpperCase()) : null,
            ),
            title: Text(user.label),
            subtitle: Text('${user.email} · ${user.authProvider == 'google' ? 'Google' : 'Email'}'),
          ),
        const ListTile(title: Text('Theme'), dense: true),
        RadioGroup<String>(
          groupValue: theme.themeName,
          onChanged: (value) async {
            if (value == null) return;
            try {
              await theme.setTheme(value, signedIn: auth.isSignedIn);
            } catch (e) {
              if (context.mounted) showError(context, e);
            }
          },
          child: Column(children: [
            for (final entry in ThemeProvider.options.entries)
              RadioListTile<String>(value: entry.key, title: Text(entry.value)),
          ]),
        ),
        if (user != null) ...[
          const Divider(),
          ListTile(
            leading: const Icon(Icons.local_offer_outlined),
            title: const Text('Favourite genres'),
            subtitle: Text(user.preferredGenres.isEmpty
                ? 'None picked yet'
                : user.preferredGenres.map((g) => g.name).join(', ')),
            onTap: () => Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const GenreOnboardingScreen(editing: true))),
          ),
          ListTile(
            leading: const Icon(Icons.logout),
            title: const Text('Sign out'),
            onTap: () async {
              await auth.logout();
              if (context.mounted) Navigator.of(context).popUntil((r) => r.isFirst);
            },
          ),
        ],
      ]),
    );
  }
}
