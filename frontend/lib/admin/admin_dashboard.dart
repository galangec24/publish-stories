import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../widgets/common.dart';
import 'bulk_import_screen.dart';
import 'story_studio.dart';

/// Admin home: a navigation rail (or bottom bar on phones) over the admin sections.
class AdminDashboard extends StatefulWidget {
  const AdminDashboard({super.key});

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  int _section = 0;

  static const _sections = [
    (Icons.menu_book_outlined, 'Stories'),
    (Icons.upload_file_outlined, 'Import'),
    (Icons.local_offer_outlined, 'Genres'),
    (Icons.view_column_outlined, 'Columns'),
    (Icons.receipt_long_outlined, 'Payments'),
  ];

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 720;
    final body = switch (_section) {
      0 => const AdminStoryList(),
      1 => const BulkImportScreen(),
      2 => const _GenreManager(),
      3 => const _ColumnManager(),
      _ => const _PaymentLogList(),
    };
    return Scaffold(
      appBar: AppBar(title: Text('Admin · ${_sections[_section].$2}')),
      body: Row(children: [
        if (wide)
          NavigationRail(
            selectedIndex: _section,
            labelType: NavigationRailLabelType.all,
            onDestinationSelected: (i) => setState(() => _section = i),
            destinations: [
              for (final (icon, label) in _sections)
                NavigationRailDestination(icon: Icon(icon), label: Text(label)),
            ],
          ),
        Expanded(child: body),
      ]),
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: _section,
              onDestinationSelected: (i) => setState(() => _section = i),
              destinations: [
                for (final (icon, label) in _sections) NavigationDestination(icon: Icon(icon), label: label),
              ],
            ),
    );
  }
}

class AdminStoryList extends StatefulWidget {
  const AdminStoryList({super.key});

  @override
  State<AdminStoryList> createState() => _AdminStoryListState();
}

class _AdminStoryListState extends State<AdminStoryList> {
  List<StorySummary>? _stories;
  List<Genre> _genres = const [];
  Map<String, dynamic>? _stats;
  String? _status;
  String? _genre;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<ApiClient>();
    try {
      final results = await Future.wait([
        api.get('admin/stories/', query: {'status': _status, 'genre': _genre, 'q': _query.isEmpty ? null : _query}),
        api.get('admin/genres/'),
        api.get('stats/'),
      ]);
      setState(() {
        _stories = [
          for (final s in (results[0] as Map<String, dynamic>)['results'] as List)
            StorySummary.fromJson(s as Map<String, dynamic>)
        ];
        _genres = [for (final g in results[1] as List) Genre.fromJson(g as Map<String, dynamic>)];
        _stats = results[2] as Map<String, dynamic>;
      });
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _newStory() async {
    final title = await _prompt(context, 'New story', 'Title');
    if (title == null || title.isEmpty || !mounted) return;
    try {
      final data = await context.read<ApiClient>().post('admin/stories/', {'title': title}) as Map<String, dynamic>;
      if (mounted) await _openStudio(data['id'] as int);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _openStudio(int id) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => StoryStudio(storyId: id)));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final stories = _stories;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _newStory,
        icon: const Icon(Icons.add),
        label: const Text('New story'),
      ),
      body: Column(children: [
        if (_stats != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            child: Row(children: [
              for (final (label, key) in [('Total readers', 'total_readers'), ('Total views', 'total_views'), ('Published', 'published_stories')])
                Expanded(
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${_stats![key]}', style: Theme.of(context).textTheme.headlineSmall),
                        Text(label, style: Theme.of(context).textTheme.bodySmall),
                      ]),
                    ),
                  ),
                ),
            ]),
          ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
            SizedBox(
              width: 260,
              child: TextField(
                decoration: const InputDecoration(
                    hintText: 'Search', prefixIcon: Icon(Icons.search), isDense: true, border: OutlineInputBorder()),
                onSubmitted: (v) {
                  _query = v.trim();
                  _load();
                },
              ),
            ),
            for (final (value, label) in [(null, 'All'), ('draft', 'Drafts'), ('published', 'Published')])
              ChoiceChip(
                label: Text(label),
                selected: _status == value,
                onSelected: (_) {
                  setState(() => _status = value);
                  _load();
                },
              ),
            DropdownButton<String?>(
              value: _genre,
              hint: const Text('Any genre'),
              items: [
                const DropdownMenuItem(value: null, child: Text('Any genre')),
                for (final g in _genres) DropdownMenuItem(value: g.slug, child: Text(g.name)),
              ],
              onChanged: (v) {
                setState(() => _genre = v);
                _load();
              },
            ),
          ]),
        ),
        Expanded(
          child: stories == null
              ? const Center(child: CircularProgressIndicator())
              : stories.isEmpty
                  ? const Center(child: Text('No stories yet. Create one or import manuscripts.'))
                  : ListView.separated(
                      itemCount: stories.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (_, i) {
                        final s = stories[i];
                        return ListTile(
                          title: Text(s.title),
                          subtitle: Text([
                            s.isPublished ? 'Published' : 'Draft',
                            s.priceLabel,
                            '${s.chapterCount} chapter${s.chapterCount == 1 ? '' : 's'}',
                            '${s.wordCount} words',
                            '${s.viewCount} views · ${s.readerCount} readers',
                            if (s.genres.isNotEmpty) s.genres.map((g) => g.name).join(', '),
                          ].join(' · ')),
                          leading: Icon(s.isPublished ? Icons.public : Icons.edit_document),
                          onTap: () => _openStudio(s.id),
                        );
                      },
                    ),
        ),
      ]),
    );
  }
}

Future<String?> _prompt(BuildContext context, String title, String label, {String initial = ''}) {
  final controller = TextEditingController(text: initial);
  return showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: controller,
        autofocus: true,
        decoration: InputDecoration(labelText: label),
        onSubmitted: (v) => Navigator.of(context).pop(v.trim()),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.of(context).pop(controller.text.trim()), child: const Text('OK')),
      ],
    ),
  );
}

class _GenreManager extends StatefulWidget {
  const _GenreManager();

  @override
  State<_GenreManager> createState() => _GenreManagerState();
}

class _GenreManagerState extends State<_GenreManager> {
  List<Genre>? _genres;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = await context.read<ApiClient>().get('admin/genres/') as List;
    if (mounted) setState(() => _genres = [for (final g in data) Genre.fromJson(g as Map<String, dynamic>)]);
  }

  Future<void> _edit([Genre? genre]) async {
    final name = TextEditingController(text: genre?.name);
    final color = TextEditingController(text: genre?.colorHex ?? '#6750A4');
    final description = TextEditingController(text: genre?.description);
    var active = genre?.isActive ?? true;
    final save = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: Text(genre == null ? 'New genre' : 'Edit genre'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
            TextField(controller: description, decoration: const InputDecoration(labelText: 'Description')),
            TextField(controller: color, decoration: const InputDecoration(labelText: 'Colour (#RRGGBB)')),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Shown to readers'),
              value: active,
              onChanged: (v) => setLocal(() => active = v),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Save')),
          ],
        ),
      ),
    );
    if (save != true || !mounted) return;
    final body = {'name': name.text.trim(), 'description': description.text.trim(), 'color': color.text.trim(), 'is_active': active};
    try {
      final api = context.read<ApiClient>();
      genre == null ? await api.post('admin/genres/', body) : await api.patch('admin/genres/${genre.id}/', body);
      _load();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final genres = _genres;
    return Scaffold(
      floatingActionButton: FloatingActionButton(onPressed: () => _edit(), child: const Icon(Icons.add)),
      body: genres == null
          ? const Center(child: CircularProgressIndicator())
          : ReorderableListView(
              onReorder: (from, to) async {
                if (to > from) to--;
                final list = [...genres];
                list.insert(to, list.removeAt(from));
                setState(() => _genres = list);
                final api = context.read<ApiClient>();
                for (var i = 0; i < list.length; i++) {
                  await api.patch('admin/genres/${list[i].id}/', {'sort_order': i});
                }
              },
              children: [
                for (final g in genres)
                  ListTile(
                    key: ValueKey(g.id),
                    leading: CircleAvatar(backgroundColor: g.color, radius: 10),
                    title: Text(g.name),
                    subtitle: Text(g.isActive ? g.description : 'Hidden from readers'),
                    onTap: () => _edit(g),
                  ),
              ],
            ),
    );
  }
}

class _ColumnManager extends StatefulWidget {
  const _ColumnManager();

  @override
  State<_ColumnManager> createState() => _ColumnManagerState();
}

class _ColumnManagerState extends State<_ColumnManager> {
  List<ColumnInfo>? _columns;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = await context.read<ApiClient>().get('admin/columns/') as List;
    if (mounted) setState(() => _columns = [for (final c in data) ColumnInfo.fromJson(c as Map<String, dynamic>)]);
  }

  Future<void> _edit([ColumnInfo? column]) async {
    final title = TextEditingController(text: column?.title);
    final description = TextEditingController(text: column?.description);
    var isPublic = column?.isPublic ?? false;
    final save = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: Text(column == null ? 'New column' : 'Edit column'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: title, decoration: const InputDecoration(labelText: 'Title')),
            TextField(controller: description, maxLines: 3, decoration: const InputDecoration(labelText: 'Description')),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Public (free for everyone)'),
              value: isPublic,
              onChanged: (v) => setLocal(() => isPublic = v),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Save')),
          ],
        ),
      ),
    );
    if (save != true || !mounted) return;
    final body = {'title': title.text.trim(), 'description': description.text.trim(), 'is_public': isPublic};
    try {
      final api = context.read<ApiClient>();
      column == null ? await api.post('admin/columns/', body) : await api.patch('admin/columns/${column.id}/', body);
      _load();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final columns = _columns;
    return Scaffold(
      floatingActionButton: FloatingActionButton(onPressed: () => _edit(), child: const Icon(Icons.add)),
      body: columns == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(children: [
              for (final c in columns)
                ListTile(
                  leading: Icon(c.isPublic ? Icons.lock_open : Icons.lock_outline),
                  title: Text(c.title),
                  subtitle: Text(c.isPublic ? 'Public · free' : 'Paywalled'),
                  onTap: () => _edit(c),
                ),
            ]),
    );
  }
}

class _PaymentLogList extends StatefulWidget {
  const _PaymentLogList();

  @override
  State<_PaymentLogList> createState() => _PaymentLogListState();
}

class _PaymentLogListState extends State<_PaymentLogList> {
  List<Map<String, dynamic>>? _logs;

  @override
  void initState() {
    super.initState();
    context.read<ApiClient>().get('admin/payments/logs/').then((data) {
      if (mounted) {
        setState(() => _logs = [for (final l in (data as Map<String, dynamic>)['results'] as List) l as Map<String, dynamic>]);
      }
    }).catchError((Object e) {
      if (mounted) showError(context, e);
    });
  }

  @override
  Widget build(BuildContext context) {
    final logs = _logs;
    if (logs == null) return const Center(child: CircularProgressIndicator());
    if (logs.isEmpty) return const Center(child: Text('No webhook events yet.'));
    const encoder = JsonEncoder.withIndent('  ');
    return ListView(children: [
      for (final log in logs)
        ExpansionTile(
          leading: Icon(switch (log['status']) {
            'paid' => Icons.check_circle_outline,
            'rejected' => Icons.gpp_bad_outlined,
            _ => Icons.info_outline,
          }),
          title: Text('${log['event_type']} · ${log['status']}'),
          subtitle: Text('${log['created_at']} · subscription ${log['subscription'] ?? '-'}'),
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: SelectableText(encoder.convert(log['raw_webhook']),
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
            ),
          ],
        ),
    ]);
  }
}
