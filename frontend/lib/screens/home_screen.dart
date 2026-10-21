import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../admin/admin_dashboard.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../state/auth_provider.dart';
import '../widgets/common.dart';
import '../widgets/story_card.dart';
import 'auth/login_screen.dart';
import 'settings_screen.dart';

List<StorySummary> _stories(dynamic list) =>
    [for (final s in (list as List? ?? const [])) StorySummary.fromJson(s as Map<String, dynamic>)];

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? _home;
  List<Genre> _genres = const [];
  final Set<String> _genreFilter = {};
  String _query = '';
  List<StorySummary>? _filtered;
  Timer? _debounce;
  bool? _wasSignedIn;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Reload when the user signs in or out: the "For you" shelf depends on it.
    final signedIn = context.watch<AuthProvider>().isSignedIn;
    if (_wasSignedIn != signedIn) {
      _wasSignedIn = signedIn;
      _loadHome();
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _loadHome() async {
    try {
      final data = await context.read<ApiClient>().get('home/') as Map<String, dynamic>;
      setState(() {
        _home = data;
        _genres = [for (final g in data['genres'] as List) Genre.fromJson(g as Map<String, dynamic>)];
      });
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _loadFiltered() async {
    if (_genreFilter.isEmpty && _query.isEmpty) {
      setState(() => _filtered = null);
      return;
    }
    try {
      final data = await context.read<ApiClient>().get('stories/', query: {
        if (_genreFilter.isNotEmpty) 'genre': _genreFilter.join(','),
        if (_query.isNotEmpty) 'q': _query,
      }) as Map<String, dynamic>;
      setState(() => _filtered = _stories(data['results']));
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Stories'),
        actions: [
          if (auth.isAdmin)
            IconButton(
              tooltip: 'Admin studio',
              icon: const Icon(Icons.edit_note),
              onPressed: () =>
                  Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AdminDashboard())),
            ),
          IconButton(
            tooltip: 'Settings',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SettingsScreen())),
          ),
          if (!auth.isSignedIn)
            TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())),
              child: const Text('Sign in'),
            ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(112),
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                decoration: const InputDecoration(
                  hintText: 'Search titles, authors…',
                  prefixIcon: Icon(Icons.search),
                  isDense: true,
                  border: OutlineInputBorder(),
                ),
                onChanged: (value) {
                  _debounce?.cancel();
                  _debounce = Timer(const Duration(milliseconds: 350), () {
                    _query = value.trim();
                    _loadFiltered();
                  });
                },
              ),
            ),
            SizedBox(
              height: 56,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                children: [
                  for (final genre in _genres)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: FilterChip(
                        label: Text(genre.name),
                        selected: _genreFilter.contains(genre.slug),
                        selectedColor: genre.color.withValues(alpha: 0.25),
                        onSelected: (on) {
                          setState(() => on ? _genreFilter.add(genre.slug) : _genreFilter.remove(genre.slug));
                          _loadFiltered();
                        },
                      ),
                    ),
                ],
              ),
            ),
          ]),
        ),
      ),
      body: _home == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () async {
                await _loadHome();
                await _loadFiltered();
              },
              child: _filtered != null ? _buildFiltered() : _buildShelves(auth),
            ),
    );
  }

  Widget _buildFiltered() {
    final stories = _filtered!;
    if (stories.isEmpty) {
      return ListView(children: const [
        SizedBox(height: 120),
        Center(child: Text('No stories match these filters yet.')),
      ]);
    }
    return GridView.builder(
      padding: const EdgeInsets.all(12),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 180, childAspectRatio: 0.5),
      itemCount: stories.length,
      itemBuilder: (_, i) => StoryCard(story: stories[i]),
    );
  }

  Widget _buildShelves(AuthProvider auth) {
    final home = _home!;
    return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
      if (auth.isSignedIn)
        StoryShelf(
          title: 'For you',
          subtitle: auth.user!.preferredGenres.map((g) => g.name).join(', '),
          stories: _stories(home['for_you']),
        ),
      for (final column in home['public_columns'] as List)
        StoryShelf(
          title: column['title'] as String,
          subtitle: 'Free to read, always',
          stories: _stories(column['stories']),
        ),
      StoryShelf(title: 'New & updated', stories: _stories(home['latest'])),
      StoryShelf(title: 'Free reads', stories: _stories(home['free'])),
      for (final row in home['by_genre'] as List)
        StoryShelf(title: row['genre']['name'] as String, stories: _stories(row['stories'])),
    ]);
  }
}
