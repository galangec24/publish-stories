import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../state/auth_provider.dart';
import '../widgets/common.dart';

/// "What do you like to read?" Shown once after the first sign-in, and from
/// Settings to change genres later ([editing] = true).
class GenreOnboardingScreen extends StatefulWidget {
  const GenreOnboardingScreen({super.key, this.editing = false});
  final bool editing;

  @override
  State<GenreOnboardingScreen> createState() => _GenreOnboardingScreenState();
}

class _GenreOnboardingScreenState extends State<GenreOnboardingScreen> {
  List<Genre>? _genres;
  late Set<int> _selected;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _selected = {for (final g in context.read<AuthProvider>().user?.preferredGenres ?? const <Genre>[]) g.id};
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await context.read<ApiClient>().get('genres/') as List;
      setState(() => _genres = [for (final g in data) Genre.fromJson(g as Map<String, dynamic>)]);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _save(List<int> ids) async {
    setState(() => _busy = true);
    try {
      await context.read<AuthProvider>().saveGenres(ids);
      if (mounted && widget.editing) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final genres = _genres;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.editing ? 'Your genres' : 'Welcome!'),
        actions: [
          if (!widget.editing)
            TextButton(onPressed: _busy ? null : () => _save(const []), child: const Text('Skip')),
        ],
      ),
      body: genres == null
          ? const Center(child: CircularProgressIndicator())
          : NarrowBody(maxWidth: 640, children: [
              Text('What do you like to read?', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              const Text('Pick a few genres and we\'ll fill your "For you" shelf. You can change these anytime.'),
              const SizedBox(height: 24),
              GenreChipSelector(genres: genres, selected: _selected, onChanged: (s) => setState(() => _selected = s)),
              const SizedBox(height: 32),
              BusyButton(
                busy: _busy,
                onPressed: _selected.isEmpty && !widget.editing ? null : () => _save(_selected.toList()),
                label: _selected.isEmpty ? 'Pick at least one' : 'Continue (${_selected.length} selected)',
              ),
            ]),
    );
  }
}
