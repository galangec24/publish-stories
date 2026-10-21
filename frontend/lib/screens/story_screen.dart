import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../security/screen_guard.dart';
import '../state/auth_provider.dart';
import '../state/theme_provider.dart';
import '../widgets/common.dart';
import '../widgets/story_card.dart' show compactCount;
import 'auth/login_screen.dart';

/// Story reader. Content arrives already truncated by the server for locked
/// readers; the screen is wrapped in [ProtectedContent] against capture.
class StoryScreen extends StatefulWidget {
  const StoryScreen({super.key, required this.slug});
  final String slug;

  @override
  State<StoryScreen> createState() => _StoryScreenState();
}

class _StoryScreenState extends State<StoryScreen> {
  StoryDetail? _story;
  int _chapterIndex = 0;
  QuillController? _controller;
  bool _paying = false;
  Timer? _poll;
  int? _views;
  int? _readers;
  String _guestMode = 'scroll';

  @override
  void initState() {
    super.initState();
    _load();
    _recordView();
  }

  /// Counted server-side at most once per reader per day.
  Future<void> _recordView() async {
    try {
      final data = await context.read<ApiClient>().post('stories/${widget.slug}/view/') as Map<String, dynamic>;
      if (mounted) {
        setState(() {
          _views = data['view_count'] as int;
          _readers = data['reader_count'] as int;
        });
      }
    } catch (_) {}
  }

  Future<void> _toggleMode() async {
    final auth = context.read<AuthProvider>();
    final next = (auth.user?.readingMode ?? _guestMode) == 'book' ? 'scroll' : 'book';
    setState(() => _guestMode = next);
    if (auth.isSignedIn) {
      try {
        await auth.setReadingMode(next);
      } catch (e) {
        if (mounted) showError(context, e);
      }
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await context.read<ApiClient>().get('stories/${widget.slug}/') as Map<String, dynamic>;
      final story = StoryDetail.fromJson(data);
      setState(() => _story = story);
      _openChapter(_chapterIndex.clamp(0, story.chapters.length - 1));
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  void _openChapter(int index) {
    final chapter = _story!.chapters[index];
    _controller?.dispose();
    _controller = chapter.content == null
        ? null
        : QuillController(
            document: Document.fromJson(chapter.content!),
            selection: const TextSelection.collapsed(offset: 0),
            readOnly: true,
          );
    setState(() => _chapterIndex = index);
  }

  Future<void> _subscribe() async {
    final auth = context.read<AuthProvider>();
    if (!auth.isSignedIn) {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
      if (!auth.isSignedIn) return;
      await _load();
      if (!(_story?.locked ?? false)) return;
    }
    setState(() => _paying = true);
    try {
      final api = context.read<ApiClient>();
      final data = await api.post('subscribe/${_story!.summary.id}/') as Map<String, dynamic>;
      final subscriptionId = data['subscription']['id'];
      await launchUrl(Uri.parse(data['checkout_url'] as String), mode: LaunchMode.externalApplication);
      // Poll until the PayMongo webhook marks the subscription paid (max ~10 minutes).
      var ticks = 0;
      _poll?.cancel();
      _poll = Timer.periodic(const Duration(seconds: 4), (timer) async {
        if (!mounted || ++ticks > 150) {
          timer.cancel();
          if (mounted) setState(() => _paying = false);
          return;
        }
        try {
          final sub = await api.get('subscriptions/$subscriptionId/') as Map<String, dynamic>;
          if (sub['status'] == 'paid') {
            timer.cancel();
            await _load();
            if (mounted) {
              setState(() => _paying = false);
              showMessage(context, 'Unlocked! Enjoy the full story.');
            }
          } else if (sub['status'] == 'failed') {
            timer.cancel();
            if (mounted) setState(() => _paying = false);
          }
        } catch (_) {}
      });
    } catch (e) {
      if (mounted) {
        setState(() => _paying = false);
        showError(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final story = _story;
    if (story == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final toc = _TableOfContents(
        story: story,
        current: _chapterIndex,
        views: _views ?? story.summary.viewCount,
        readers: _readers ?? story.summary.readerCount,
        onTap: (i) {
      if (!wide) Navigator.of(context).pop();
      _openChapter(i);
    });
    final user = context.watch<AuthProvider>().user;
    final email = user?.email;
    final bookMode = (user?.readingMode ?? _guestMode) == 'book';

    return Scaffold(
      appBar: AppBar(title: Text(story.summary.title), actions: [
        IconButton(
          tooltip: bookMode ? 'Switch to long page' : 'Switch to book pages',
          icon: Icon(bookMode ? Icons.view_day_outlined : Icons.auto_stories_outlined),
          onPressed: _toggleMode,
        ),
      ]),
      drawer: wide ? null : Drawer(child: toc),
      body: Row(children: [
        if (wide) SizedBox(width: 280, child: Material(elevation: 1, child: toc)),
        Expanded(
          child: ProtectedContent(
            watermark: email,
            child: _ChapterView(
              story: story,
              index: _chapterIndex,
              controller: _controller,
              bookMode: bookMode,
              paying: _paying,
              onSubscribe: _subscribe,
              onRefresh: _load,
              onNavigate: _openChapter,
            ),
          ),
        ),
      ]),
    );
  }
}

class _TableOfContents extends StatelessWidget {
  const _TableOfContents(
      {required this.story, required this.current, required this.views, required this.readers, required this.onTap});

  final StoryDetail story;
  final int current;
  final int views;
  final int readers;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final s = story.summary;
    return ListView(children: [
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.title, style: Theme.of(context).textTheme.titleLarge),
          if (s.authorName.isNotEmpty) Text('by ${s.authorName}'),
          const SizedBox(height: 8),
          GenreTags(genres: s.genres),
          const SizedBox(height: 8),
          Row(children: [
            const Icon(Icons.visibility_outlined, size: 16),
            Text(' ${compactCount(views)} views   '),
            const Icon(Icons.people_outline, size: 16),
            Text(' ${compactCount(readers)} readers'),
          ]),
          if (s.synopsis.isNotEmpty) ...[const SizedBox(height: 8), Text(s.synopsis)],
        ]),
      ),
      const Divider(),
      for (var i = 0; i < story.chapters.length; i++)
        ListTile(
          dense: true,
          selected: i == current,
          title: Text(story.chapters[i].title),
          trailing: story.chapters[i].content == null ? const Icon(Icons.lock_outline, size: 18) : null,
          onTap: () => onTap(i),
        ),
    ]);
  }
}

class _ChapterView extends StatelessWidget {
  const _ChapterView({
    required this.story,
    required this.index,
    required this.controller,
    required this.bookMode,
    required this.paying,
    required this.onSubscribe,
    required this.onRefresh,
    required this.onNavigate,
  });

  final StoryDetail story;
  final int index;
  final QuillController? controller;
  final bool bookMode;
  final bool paying;
  final VoidCallback onSubscribe;
  final Future<void> Function() onRefresh;
  final ValueChanged<int> onNavigate;

  @override
  Widget build(BuildContext context) {
    final chapter = story.chapters[index];
    final pageColor = context.watch<ThemeProvider>().pageColor;
    final showPaywall = chapter.locked || chapter.content == null;
    return ColoredBox(
      color: pageColor,
      child: Column(children: [
        Expanded(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
                  child: Text(chapter.title, style: Theme.of(context).textTheme.headlineSmall),
                ),
                if (bookMode && chapter.content != null)
                  Expanded(
                    child: _BookPages(
                      key: ValueKey('${chapter.id}-${chapter.content!.length}'),
                      ops: chapter.content!,
                      onPastEnd: index < story.chapters.length - 1 ? () => onNavigate(index + 1) : null,
                    ),
                  )
                else if (controller != null)
                  Expanded(
                    child: QuillEditor.basic(
                      controller: controller!,
                      config: const QuillEditorConfig(
                        padding: EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                        enableInteractiveSelection: false,
                      ),
                    ),
                  )
                else
                  const Spacer(),
                if (showPaywall) _Paywall(story: story, paying: paying, onSubscribe: onSubscribe, onRefresh: onRefresh),
              ]),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(8),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            TextButton.icon(
              onPressed: index > 0 ? () => onNavigate(index - 1) : null,
              icon: const Icon(Icons.chevron_left),
              label: const Text('Previous'),
            ),
            Text('${index + 1} / ${story.chapters.length}'),
            TextButton.icon(
              onPressed: index < story.chapters.length - 1 ? () => onNavigate(index + 1) : null,
              icon: const Icon(Icons.chevron_right),
              label: const Text('Next'),
            ),
          ]),
        ),
      ]),
    );
  }
}

/// Book mode for the apps: the chapter is split into pages of a few paragraphs
/// and shown in a swipeable PageView (swipe left for the next page).
class _BookPages extends StatefulWidget {
  const _BookPages({super.key, required this.ops, this.onPastEnd});

  final List ops;
  final VoidCallback? onPastEnd;

  static const paragraphsPerPage = 5;

  @override
  State<_BookPages> createState() => _BookPagesState();
}

class _BookPagesState extends State<_BookPages> {
  final _pager = PageController();
  late final List<QuillController> _pages = [
    for (final ops in _paginate(widget.ops, _BookPages.paragraphsPerPage))
      QuillController(
        document: Document.fromJson(ops),
        selection: const TextSelection.collapsed(offset: 0),
        readOnly: true,
      ),
  ];
  int _page = 0;

  @override
  void dispose() {
    _pager.dispose();
    for (final c in _pages) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Expanded(
        child: NotificationListener<OverscrollNotification>(
          // Swiping past the last page moves on to the next chapter.
          onNotification: (n) {
            if (n.overscroll > 12 && _page == _pages.length - 1) widget.onPastEnd?.call();
            return false;
          },
          child: PageView.builder(
            controller: _pager,
            itemCount: _pages.length,
            onPageChanged: (p) => setState(() => _page = p),
            itemBuilder: (_, i) => QuillEditor.basic(
              controller: _pages[i],
              config: const QuillEditorConfig(
                padding: EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                enableInteractiveSelection: false,
              ),
            ),
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Text('Page ${_page + 1} of ${_pages.length}', style: Theme.of(context).textTheme.bodySmall),
      ),
    ]);
  }
}

/// Split a Delta into pages of [perPage] non-empty lines, cutting only at line ends.
List<List<Map<String, dynamic>>> _paginate(List ops, int perPage) {
  final pages = <List<Map<String, dynamic>>>[];
  var current = <Map<String, dynamic>>[];
  var lines = 0;
  var lineHasText = false;
  for (final raw in ops) {
    final op = Map<String, dynamic>.from(raw as Map);
    final insert = op['insert'];
    if (insert is! String) {
      current.add(op);
      lineHasText = true;
      continue;
    }
    final parts = insert.split('\n');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].isNotEmpty) {
        current.add({...op, 'insert': parts[i]});
        if (parts[i].trim().isNotEmpty) lineHasText = true;
      }
      if (i == parts.length - 1) break;
      current.add({if (op['attributes'] != null) 'attributes': op['attributes'], 'insert': '\n'});
      if (lineHasText) lines++;
      lineHasText = false;
      if (lines >= perPage) {
        pages.add(current);
        current = [];
        lines = 0;
      }
    }
  }
  if (current.any((o) => o['insert'] is! String || (o['insert'] as String).trim().isNotEmpty)) {
    if (current.last['insert'] != '\n') current.add({'insert': '\n'});
    pages.add(current);
  }
  return pages.isEmpty
      ? [
          [
            {'insert': '\n'}
          ]
        ]
      : pages;
}

class _Paywall extends StatelessWidget {
  const _Paywall({required this.story, required this.paying, required this.onSubscribe, required this.onRefresh});

  final StoryDetail story;
  final bool paying;
  final VoidCallback onSubscribe;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.all(24),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(children: [
          const Icon(Icons.lock_outline, size: 36),
          const SizedBox(height: 8),
          Text('Keep reading for ${story.summary.priceLabel}', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          const Text('Pay once with GCash, Maya or your bank app via QR Ph.', textAlign: TextAlign.center),
          const SizedBox(height: 16),
          if (paying) ...[
            const LinearProgressIndicator(),
            const SizedBox(height: 8),
            const Text('Waiting for payment confirmation…'),
            TextButton(onPressed: onRefresh, child: const Text('I already paid, refresh')),
          ] else
            FilledButton.icon(onPressed: onSubscribe, icon: const Icon(Icons.qr_code_2), label: const Text('Unlock story')),
        ]),
      ),
    );
  }
}
