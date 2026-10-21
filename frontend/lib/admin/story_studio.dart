import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../screens/story_screen.dart';
import '../state/theme_provider.dart';
import '../widgets/common.dart';

enum _SaveState { saved, dirty, saving, error }

/// Word-style editor for one story.
///
///  ┌ title bar: story title · save status · Story settings · Publish ┐
///  ├ ribbon tabs: Home | Insert | View | Review                       ┤
///  ├ ribbon: grouped formatting commands for the active tab           ┤
///  ├ navigation pane │ page (Quill editor on a paper-like sheet)      ┤
///  └ status bar: chapter n of m · words · zoom                        ┘
///
/// Chapters autosave two seconds after the last keystroke (or on Ctrl+S).
class StoryStudio extends StatefulWidget {
  const StoryStudio({super.key, required this.storyId});
  final int storyId;

  @override
  State<StoryStudio> createState() => _StoryStudioState();
}

class _StoryStudioState extends State<StoryStudio> {
  late final ApiClient _api = context.read<ApiClient>();
  final _focus = FocusNode();
  final _scroll = ScrollController();
  final _scaffold = GlobalKey<ScaffoldState>();

  Map<String, dynamic>? _story;
  List<Map<String, dynamic>> _chapters = [];
  List<Genre> _genres = [];
  List<ColumnInfo> _columns = [];

  int? _chapterId;
  int _revision = 1;
  QuillController? _controller;
  StreamSubscription? _docChanges;
  Timer? _autosave;
  _SaveState _saveState = _SaveState.saved;

  int _ribbonTab = 0;
  bool _showNav = true;
  double _zoom = 1.0;
  List<_Heading> _headings = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _autosave?.cancel();
    _docChanges?.cancel();
    _controller?.dispose();
    _focus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------- data

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        _api.get('admin/stories/${widget.storyId}/'),
        _api.get('admin/genres/'),
        _api.get('admin/columns/'),
      ]);
      final story = results[0] as Map<String, dynamic>;
      setState(() {
        _story = story;
        _chapters = [for (final c in story['chapters'] as List) Map<String, dynamic>.from(c as Map)];
        _genres = [for (final g in results[1] as List) Genre.fromJson(g as Map<String, dynamic>)];
        _columns = [for (final c in results[2] as List) ColumnInfo.fromJson(c as Map<String, dynamic>)];
      });
      if (_chapters.isNotEmpty) await _openChapter(_chapters.first['id'] as int);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _reloadStory() async {
    final story = await _api.get('admin/stories/${widget.storyId}/') as Map<String, dynamic>;
    setState(() {
      _story = story;
      _chapters = [for (final c in story['chapters'] as List) Map<String, dynamic>.from(c as Map)];
    });
  }

  Future<void> _openChapter(int id) async {
    if (id == _chapterId) return;
    if (!await _flush()) return;
    try {
      final data = await _api.get('admin/chapters/$id/') as Map<String, dynamic>;
      _docChanges?.cancel();
      _controller?.dispose();
      final controller = QuillController(
        document: Document.fromJson(data['content'] as List),
        selection: const TextSelection.collapsed(offset: 0),
      );
      _docChanges = controller.document.changes.listen((_) => _onEdited());
      setState(() {
        _controller = controller;
        _chapterId = id;
        _revision = data['revision'] as int;
        _saveState = _SaveState.saved;
        _headings = _extractHeadings(controller.document);
      });
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  void _onEdited() {
    _autosave?.cancel();
    _autosave = Timer(const Duration(seconds: 2), _save);
    setState(() {
      _saveState = _SaveState.dirty;
      _headings = _extractHeadings(_controller!.document);
    });
  }

  /// Save pending edits. Returns false if they couldn't be saved.
  Future<bool> _flush() async {
    _autosave?.cancel();
    if (_saveState == _SaveState.dirty || _saveState == _SaveState.error) return _save();
    return true;
  }

  Future<bool> _save({bool force = false}) async {
    final controller = _controller;
    final id = _chapterId;
    if (controller == null || id == null) return true;
    _autosave?.cancel();
    setState(() => _saveState = _SaveState.saving);
    try {
      final data = await _api.patch('admin/chapters/$id/', {
        'content': controller.document.toDelta().toJson(),
        'revision': _revision,
      }) as Map<String, dynamic>;
      if (!mounted) return true;
      setState(() {
        _revision = data['revision'] as int;
        // Typing during the request keeps the dirty flag.
        if (_saveState == _SaveState.saving) _saveState = _SaveState.saved;
        _patchChapter(id, data);
      });
      return true;
    } on ApiException catch (e) {
      if (!mounted) return false;
      setState(() => _saveState = _SaveState.error);
      if (e.status == 409) return _resolveConflict(e.body['current'] as Map<String, dynamic>);
      showError(context, e);
      return false;
    } catch (e) {
      if (mounted) {
        setState(() => _saveState = _SaveState.error);
        showError(context, 'Not saved, check your connection. $e');
      }
      return false;
    }
  }

  /// Another admin saved this chapter since we loaded it.
  Future<bool> _resolveConflict(Map<String, dynamic> current) async {
    final choice = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Chapter changed elsewhere'),
        content: const Text('Someone else saved this chapter while you were editing. '
            'Keep your version (overwrites theirs) or load theirs (discards your unsaved changes)?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop('theirs'), child: const Text('Load theirs')),
          FilledButton(onPressed: () => Navigator.of(context).pop('mine'), child: const Text('Keep mine')),
        ],
      ),
    );
    _revision = current['revision'] as int;
    if (choice == 'mine') return _save();
    final id = _chapterId!;
    _chapterId = null;
    _saveState = _SaveState.saved;
    await _openChapter(id);
    return true;
  }

  void _patchChapter(int id, Map<String, dynamic> data) {
    final i = _chapters.indexWhere((c) => c['id'] == id);
    if (i >= 0) {
      _chapters[i] = {..._chapters[i], 'title': data['title'], 'word_count': data['word_count'], 'revision': data['revision']};
    }
  }

  // ------------------------------------------------------------ chapters

  Future<void> _addChapter({int? order, List? content, String? title}) async {
    final name = title ?? await _ask('New chapter', 'Chapter title', 'Chapter ${_chapters.length + 1}');
    if (name == null) return;
    try {
      final created = await _api.post('admin/stories/${widget.storyId}/chapters/', {
        'title': name,
        if (order != null) 'order': order,
        if (content != null) 'content': content,
      }) as Map<String, dynamic>;
      await _reloadStory();
      await _openChapter(created['id'] as int);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _renameChapter(Map<String, dynamic> chapter) async {
    final name = await _ask('Rename chapter', 'Chapter title', chapter['title'] as String);
    if (name == null) return;
    final isCurrent = chapter['id'] == _chapterId;
    if (isCurrent && !await _flush()) return;
    try {
      final data = await _api.patch('admin/chapters/${chapter['id']}/', {
        'title': name,
        'revision': isCurrent ? _revision : chapter['revision'],
      }) as Map<String, dynamic>;
      setState(() {
        if (isCurrent) _revision = data['revision'] as int;
        _patchChapter(chapter['id'] as int, data);
      });
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _deleteChapter(Map<String, dynamic> chapter) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete "${chapter['title']}"?'),
        content: const Text('This chapter and its text will be removed permanently.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _api.delete('admin/chapters/${chapter['id']}/');
      final wasCurrent = chapter['id'] == _chapterId;
      if (wasCurrent) {
        _autosave?.cancel();
        _saveState = _SaveState.saved;
        _chapterId = null;
      }
      await _reloadStory();
      if (wasCurrent && _chapters.isNotEmpty) await _openChapter(_chapters.first['id'] as int);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _reorder(int from, int to) async {
    if (to > from) to--;
    final list = [..._chapters];
    list.insert(to, list.removeAt(from));
    setState(() => _chapters = list);
    try {
      await _api.post('admin/stories/${widget.storyId}/chapters/reorder/', {'order': [for (final c in list) c['id']]});
    } catch (e) {
      if (mounted) showError(context, e);
      await _reloadStory();
    }
  }

  /// Insert ▸ Split chapter here: everything after the cursor becomes a new chapter.
  Future<void> _splitChapter() async {
    final controller = _controller!;
    final index = controller.selection.baseOffset;
    final length = controller.document.length;
    if (index <= 0 || index >= length - 1) {
      showMessage(context, 'Put the cursor inside the text where the new chapter should start.');
      return;
    }
    final title = await _ask('Split chapter', 'Title of the new chapter', 'Chapter ${_chapters.length + 1}');
    if (title == null) return;
    final tail = controller.document.toDelta().slice(index).toJson();
    controller.replaceText(index, length - 1 - index, '', TextSelection.collapsed(offset: index));
    if (!await _save()) return;
    final position = _chapters.indexWhere((c) => c['id'] == _chapterId);
    await _addChapter(order: position + 1, content: tail, title: title);
  }

  // ------------------------------------------------------------- story

  Future<void> _publish(bool publish) async {
    if (!await _flush()) return;
    try {
      final data = await _api.post('admin/stories/${widget.storyId}/${publish ? 'publish' : 'unpublish'}/')
          as Map<String, dynamic>;
      setState(() => _story = data);
      if (mounted) showMessage(context, publish ? 'Published. Readers can see it now.' : 'Moved back to drafts.');
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _saveSettings(Map<String, dynamic> changes) async {
    try {
      final data = await _api.patch('admin/stories/${widget.storyId}/', changes) as Map<String, dynamic>;
      setState(() => _story = data);
      if (mounted) showMessage(context, 'Story settings saved.');
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _uploadCover() async {
    final picked = await FilePicker.platform.pickFiles(type: FileType.image, withData: true);
    final file = picked?.files.single;
    if (file?.bytes == null) return;
    try {
      final data = await _api.multipart('admin/stories/${widget.storyId}/',
          method: 'PATCH', fileField: 'cover_image', files: [UploadFile(file!.name, file.bytes!)]);
      setState(() => _story = data as Map<String, dynamic>);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  // ------------------------------------------------------------ editing

  bool _isOn(Attribute attribute) {
    final current = _controller?.getSelectionStyle().attributes[attribute.key];
    return current != null && current.value == attribute.value;
  }

  void _toggle(Attribute attribute) {
    final controller = _controller;
    if (controller == null) return;
    controller.formatSelection(_isOn(attribute) ? Attribute.clone(attribute, null) : attribute);
    _focus.requestFocus();
  }

  void _setHeading(int? level) {
    final controller = _controller!;
    controller.formatSelection(switch (level) {
      1 => Attribute.h1,
      2 => Attribute.h2,
      3 => Attribute.h3,
      _ => Attribute.clone(Attribute.header, null),
    });
    _focus.requestFocus();
  }

  void _clearFormatting() {
    final controller = _controller!;
    for (final attribute in [Attribute.bold, Attribute.italic, Attribute.underline, Attribute.strikeThrough]) {
      controller.formatSelection(Attribute.clone(attribute, null));
    }
    _focus.requestFocus();
  }

  void _insertSceneBreak() {
    final controller = _controller!;
    final index = controller.selection.baseOffset.clamp(0, controller.document.length - 1);
    const text = '\n* * *\n';
    controller.replaceText(index, 0, text, TextSelection.collapsed(offset: index + text.length));
    controller.formatText(index + 1, 5, Attribute.centerAlignment);
    _focus.requestFocus();
  }

  void _jumpTo(int offset) {
    _controller!.updateSelection(TextSelection.collapsed(offset: offset), ChangeSource.local);
    _focus.requestFocus();
  }

  Future<void> _find() async {
    final query = await _ask('Find', 'Text to find', '');
    if (query == null || query.isEmpty || _controller == null) return;
    final text = _controller!.document.toPlainText().toLowerCase();
    final start = _controller!.selection.end;
    var at = text.indexOf(query.toLowerCase(), start);
    if (at < 0) at = text.indexOf(query.toLowerCase());
    if (at < 0) {
      if (mounted) showMessage(context, 'No matches for "$query" in this chapter.');
      return;
    }
    _controller!.updateSelection(TextSelection(baseOffset: at, extentOffset: at + query.length), ChangeSource.local);
    _focus.requestFocus();
  }

  void _showWordCount() {
    final text = _controller?.document.toPlainText() ?? '';
    final words = text.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;
    final paragraphs = text.split('\n').where((l) => l.trim().isNotEmpty).length;
    final storyWords = _chapters.fold<int>(0, (sum, c) => sum + (c['word_count'] as int? ?? 0));
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Word count'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('This chapter: $words words'),
          Text('Characters: ${text.replaceAll('\n', '').length}'),
          Text('Paragraphs: $paragraphs'),
          const Divider(),
          Text('Whole story (last saved): $storyWords words in ${_chapters.length} chapters'),
          Text('Readers who haven\'t paid see the first ${_story?['preview_page_count']} paragraphs.'),
        ]),
        actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Close'))],
      ),
    );
  }

  Future<String?> _ask(String title, String label, String initial) {
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

  // --------------------------------------------------------------- UI

  @override
  Widget build(BuildContext context) {
    final story = _story;
    if (story == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final published = story['status'] == 'published';

    return PopScope(
      canPop: _saveState == _SaveState.saved,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _flush() && context.mounted) Navigator.of(context).pop();
      },
      child: CallbackShortcuts(
        bindings: {
          const SingleActivator(LogicalKeyboardKey.keyS, control: true): _save,
          const SingleActivator(LogicalKeyboardKey.keyS, meta: true): _save,
          // Ctrl+B / I / U / Z / Y are handled by the Quill editor itself.
          const SingleActivator(LogicalKeyboardKey.keyF, control: true): _find,
        },
        child: Scaffold(
          key: _scaffold,
          appBar: AppBar(
            titleSpacing: 0,
            title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(story['title'] as String, overflow: TextOverflow.ellipsis),
              Text('${published ? 'Published' : 'Draft'} · ${_saveLabel()}',
                  style: Theme.of(context).textTheme.bodySmall),
            ]),
            actions: [
              IconButton(
                tooltip: 'Story settings',
                icon: const Icon(Icons.tune),
                onPressed: () => _scaffold.currentState!.openEndDrawer(),
              ),
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: published
                    ? OutlinedButton(onPressed: () => _publish(false), child: const Text('Unpublish'))
                    : FilledButton.icon(
                        onPressed: () => _publish(true), icon: const Icon(Icons.publish), label: const Text('Publish')),
              ),
            ],
          ),
          endDrawer: Drawer(
            width: 400,
            child: _StorySettingsPanel(
              story: story,
              genres: _genres,
              columns: _columns,
              onSave: _saveSettings,
              onUploadCover: _uploadCover,
            ),
          ),
          drawer: wide ? null : Drawer(child: _navigationPane()),
          body: Column(children: [
            _ribbon(),
            const Divider(height: 1),
            Expanded(
              child: Row(children: [
                if (wide && _showNav) SizedBox(width: 260, child: _navigationPane()),
                if (wide && _showNav) const VerticalDivider(width: 1),
                Expanded(child: _page()),
              ]),
            ),
            _statusBar(),
          ]),
        ),
      ),
    );
  }

  String _saveLabel() => switch (_saveState) {
        _SaveState.saved => 'All changes saved',
        _SaveState.dirty => 'Unsaved changes',
        _SaveState.saving => 'Saving…',
        _SaveState.error => 'Not saved: retry with Ctrl+S',
      };

  Widget _ribbon() {
    final controller = _controller;
    final tabs = ['Home', 'Insert', 'View', 'Review'];
    return Material(
      color: Theme.of(context).colorScheme.surfaceContainerLow,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          for (var i = 0; i < tabs.length; i++)
            TextButton(
              onPressed: () => setState(() => _ribbonTab = i),
              style: TextButton.styleFrom(
                foregroundColor: i == _ribbonTab ? Theme.of(context).colorScheme.primary : null,
                shape: const RoundedRectangleBorder(),
              ),
              child: Text(tabs[i], style: TextStyle(fontWeight: i == _ribbonTab ? FontWeight.bold : null)),
            ),
        ]),
        if (controller != null)
          ListenableBuilder(
            listenable: controller,
            builder: (context, _) => SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 6),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: switch (_ribbonTab) {
                0 => _homeTab(controller),
                1 => _insertTab(),
                2 => _viewTab(),
                _ => _reviewTab(),
              }),
            ),
          ),
      ]),
    );
  }

  List<Widget> _homeTab(QuillController controller) {
    final header = controller.getSelectionStyle().attributes[Attribute.header.key]?.value as int?;
    return [
      _RibbonGroup(label: 'History', children: [
        _RibbonButton(icon: Icons.undo, tooltip: 'Undo (Ctrl+Z)', onPressed: controller.hasUndo ? controller.undo : null),
        _RibbonButton(icon: Icons.redo, tooltip: 'Redo (Ctrl+Y)', onPressed: controller.hasRedo ? controller.redo : null),
      ]),
      _RibbonGroup(label: 'Font', children: [
        _RibbonButton(icon: Icons.format_bold, tooltip: 'Bold (Ctrl+B)', active: _isOn(Attribute.bold), onPressed: () => _toggle(Attribute.bold)),
        _RibbonButton(icon: Icons.format_italic, tooltip: 'Italic (Ctrl+I)', active: _isOn(Attribute.italic), onPressed: () => _toggle(Attribute.italic)),
        _RibbonButton(icon: Icons.format_underline, tooltip: 'Underline (Ctrl+U)', active: _isOn(Attribute.underline), onPressed: () => _toggle(Attribute.underline)),
        _RibbonButton(icon: Icons.format_strikethrough, tooltip: 'Strikethrough', active: _isOn(Attribute.strikeThrough), onPressed: () => _toggle(Attribute.strikeThrough)),
        _RibbonButton(icon: Icons.format_clear, tooltip: 'Clear formatting', onPressed: _clearFormatting),
      ]),
      _RibbonGroup(label: 'Paragraph', children: [
        _RibbonButton(icon: Icons.format_list_bulleted, tooltip: 'Bullets', active: _isOn(Attribute.ul), onPressed: () => _toggle(Attribute.ul)),
        _RibbonButton(icon: Icons.format_list_numbered, tooltip: 'Numbering', active: _isOn(Attribute.ol), onPressed: () => _toggle(Attribute.ol)),
        _RibbonButton(icon: Icons.format_quote, tooltip: 'Quote', active: _isOn(Attribute.blockQuote), onPressed: () => _toggle(Attribute.blockQuote)),
        _RibbonButton(icon: Icons.format_align_left, tooltip: 'Align left', onPressed: () => controller.formatSelection(Attribute.clone(Attribute.align, null))),
        _RibbonButton(icon: Icons.format_align_center, tooltip: 'Center', active: _isOn(Attribute.centerAlignment), onPressed: () => _toggle(Attribute.centerAlignment)),
        _RibbonButton(icon: Icons.format_align_right, tooltip: 'Align right', active: _isOn(Attribute.rightAlignment), onPressed: () => _toggle(Attribute.rightAlignment)),
        _RibbonButton(icon: Icons.format_align_justify, tooltip: 'Justify', active: _isOn(Attribute.justifyAlignment), onPressed: () => _toggle(Attribute.justifyAlignment)),
      ]),
      _RibbonGroup(label: 'Styles', children: [
        for (final (level, label) in [(null, 'Normal'), (1, 'Heading 1'), (2, 'Heading 2'), (3, 'Heading 3')])
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: ChoiceChip(
              label: Text(label, style: TextStyle(fontSize: level == null ? 13 : 17.0 - (level * 1.5), fontWeight: level == null ? null : FontWeight.bold)),
              selected: header == level,
              onSelected: (_) => _setHeading(level),
            ),
          ),
      ]),
      _RibbonGroup(label: 'Save', children: [
        _RibbonButton(icon: Icons.save_outlined, tooltip: 'Save now (Ctrl+S)', onPressed: _save),
      ]),
    ];
  }

  List<Widget> _insertTab() => [
        _RibbonGroup(label: 'Chapters', children: [
          _RibbonLabeledButton(icon: Icons.note_add_outlined, label: 'New chapter', onPressed: () => _addChapter()),
          _RibbonLabeledButton(icon: Icons.call_split, label: 'Split here', onPressed: _splitChapter),
        ]),
        _RibbonGroup(label: 'Text', children: [
          _RibbonLabeledButton(icon: Icons.more_horiz, label: 'Scene break', onPressed: _insertSceneBreak),
        ]),
      ];

  List<Widget> _viewTab() => [
        _RibbonGroup(label: 'Show', children: [
          _RibbonLabeledButton(
            icon: _showNav ? Icons.view_sidebar : Icons.view_sidebar_outlined,
            label: 'Navigation pane',
            onPressed: () => MediaQuery.sizeOf(context).width >= 900
                ? setState(() => _showNav = !_showNav)
                : _scaffold.currentState!.openDrawer(),
          ),
        ]),
        _RibbonGroup(label: 'Zoom', children: [
          _RibbonButton(icon: Icons.zoom_out, tooltip: 'Zoom out', onPressed: () => setState(() => _zoom = (_zoom - 0.1).clamp(0.7, 2.0))),
          TextButton(onPressed: () => setState(() => _zoom = 1), child: Text('${(_zoom * 100).round()}%')),
          _RibbonButton(icon: Icons.zoom_in, tooltip: 'Zoom in', onPressed: () => setState(() => _zoom = (_zoom + 0.1).clamp(0.7, 2.0))),
        ]),
        _RibbonGroup(label: 'Preview', children: [
          _RibbonLabeledButton(
            icon: Icons.chrome_reader_mode_outlined,
            label: 'Open as reader',
            onPressed: () async {
              await _flush();
              if (mounted) {
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => StoryScreen(slug: _story!['slug'] as String)));
              }
            },
          ),
        ]),
      ];

  List<Widget> _reviewTab() => [
        _RibbonGroup(label: 'Proofing', children: [
          _RibbonLabeledButton(icon: Icons.search, label: 'Find (Ctrl+F)', onPressed: _find),
          _RibbonLabeledButton(icon: Icons.numbers, label: 'Word count', onPressed: _showWordCount),
        ]),
      ];

  Widget _navigationPane() {
    return Material(
      color: Theme.of(context).colorScheme.surfaceContainerLowest,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 4, 4),
          child: Row(children: [
            Text('Navigation', style: Theme.of(context).textTheme.titleSmall),
            const Spacer(),
            IconButton(tooltip: 'New chapter', icon: const Icon(Icons.add), onPressed: () => _addChapter()),
          ]),
        ),
        Expanded(
          child: ReorderableListView.builder(
            buildDefaultDragHandles: false,
            itemCount: _chapters.length,
            onReorder: _reorder,
            itemBuilder: (context, i) {
              final chapter = _chapters[i];
              final current = chapter['id'] == _chapterId;
              return Column(key: ValueKey(chapter['id']), crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                ListTile(
                  dense: true,
                  selected: current,
                  leading: ReorderableDragStartListener(index: i, child: const Icon(Icons.drag_indicator, size: 18)),
                  title: Text(chapter['title'] as String? ?? 'Untitled', maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text('${chapter['word_count']} words'),
                  onTap: () => _openChapter(chapter['id'] as int),
                  trailing: PopupMenuButton<String>(
                    onSelected: (v) => v == 'rename' ? _renameChapter(chapter) : _deleteChapter(chapter),
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'rename', child: Text('Rename')),
                      PopupMenuItem(value: 'delete', child: Text('Delete')),
                    ],
                  ),
                ),
                // Headings inside the open chapter, like Word's navigation pane.
                if (current)
                  for (final h in _headings)
                    InkWell(
                      onTap: () => _jumpTo(h.offset),
                      child: Padding(
                        padding: EdgeInsets.fromLTRB(40.0 + (h.level - 1) * 14, 4, 8, 4),
                        child: Text(h.text, maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 13, fontWeight: h.level == 1 ? FontWeight.w600 : null)),
                      ),
                    ),
              ]);
            },
          ),
        ),
      ]),
    );
  }

  Widget _page() {
    final controller = _controller;
    if (controller == null) return const Center(child: CircularProgressIndicator());
    final pageColor = context.watch<ThemeProvider>().pageColor;
    return ColoredBox(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Center(
        child: ConstrainedBox(
          // 8.5in at 96dpi, like a Letter page in Word's print layout.
          constraints: BoxConstraints(maxWidth: 816 * _zoom),
          child: Card(
            margin: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
            color: pageColor,
            elevation: 3,
            shape: const RoundedRectangleBorder(),
            child: MediaQuery(
              data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(_zoom)),
              child: QuillEditor.basic(
                controller: controller,
                focusNode: _focus,
                scrollController: _scroll,
                config: QuillEditorConfig(
                  placeholder: 'Start writing your story…',
                  padding: EdgeInsets.symmetric(horizontal: 72 * _zoom, vertical: 64 * _zoom),
                  autoFocus: true,
                  expands: true,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _statusBar() {
    final index = _chapters.indexWhere((c) => c['id'] == _chapterId);
    final words = (_controller?.document.toPlainText() ?? '').split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;
    final storyWords = _story?['word_count'] ?? 0;
    return Material(
      color: Theme.of(context).colorScheme.surfaceContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        child: Row(children: [
          Text('Chapter ${index + 1} of ${_chapters.length}', style: const TextStyle(fontSize: 12)),
          const SizedBox(width: 16),
          Text('$words words', style: const TextStyle(fontSize: 12)),
          const SizedBox(width: 16),
          Text('Story: $storyWords words', style: const TextStyle(fontSize: 12)),
          const Spacer(),
          Text(_saveLabel(), style: const TextStyle(fontSize: 12)),
          const SizedBox(width: 12),
          SizedBox(
            width: 140,
            child: Slider(
              value: _zoom,
              min: 0.7,
              max: 2.0,
              onChanged: (v) => setState(() => _zoom = v),
            ),
          ),
          Text('${(_zoom * 100).round()}%', style: const TextStyle(fontSize: 12)),
        ]),
      ),
    );
  }
}

class _Heading {
  _Heading(this.text, this.level, this.offset);
  final String text;
  final int level;
  final int offset;
}

List<_Heading> _extractHeadings(Document document) {
  final result = <_Heading>[];
  final line = StringBuffer();
  var offset = 0;
  var lineStart = 0;
  for (final op in document.toDelta().toList()) {
    final data = op.data;
    if (data is! String) {
      offset += 1;
      continue;
    }
    for (var i = 0; i < data.length; i++) {
      if (data[i] == '\n') {
        final level = op.attributes?['header'];
        final text = line.toString().trim();
        if (level is int && text.isNotEmpty) result.add(_Heading(text, level, lineStart));
        line.clear();
        lineStart = offset + 1;
      } else {
        line.write(data[i]);
      }
      offset += 1;
    }
  }
  return result;
}

class _RibbonGroup extends StatelessWidget {
  const _RibbonGroup({required this.label, required this.children});
  final String label;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(border: Border(right: BorderSide(color: Theme.of(context).dividerColor))),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(mainAxisSize: MainAxisSize.min, children: children),
        Text(label, style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.outline)),
      ]),
    );
  }
}

class _RibbonButton extends StatelessWidget {
  const _RibbonButton({required this.icon, required this.tooltip, required this.onPressed, this.active = false});
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: tooltip,
      isSelected: active,
      style: IconButton.styleFrom(
        backgroundColor: active ? Theme.of(context).colorScheme.primaryContainer : null,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
      ),
      icon: Icon(icon, size: 20),
      onPressed: onPressed,
    );
  }
}

class _RibbonLabeledButton extends StatelessWidget {
  const _RibbonLabeledButton({required this.icon, required this.label, required this.onPressed});
  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4))),
      child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 26), Text(label, style: const TextStyle(fontSize: 12))]),
    );
  }
}

/// End drawer: metadata, genre tags, column, pricing and paywall preview.
class _StorySettingsPanel extends StatefulWidget {
  const _StorySettingsPanel({
    required this.story,
    required this.genres,
    required this.columns,
    required this.onSave,
    required this.onUploadCover,
  });

  final Map<String, dynamic> story;
  final List<Genre> genres;
  final List<ColumnInfo> columns;
  final Future<void> Function(Map<String, dynamic>) onSave;
  final VoidCallback onUploadCover;

  @override
  State<_StorySettingsPanel> createState() => _StorySettingsPanelState();
}

class _StorySettingsPanelState extends State<_StorySettingsPanel> {
  late final _title = TextEditingController(text: widget.story['title'] as String?);
  late final _author = TextEditingController(text: widget.story['author_name'] as String?);
  late final _synopsis = TextEditingController(text: widget.story['synopsis'] as String?);
  late final _price = TextEditingController(text: '${widget.story['price']}');
  late final _preview = TextEditingController(text: '${widget.story['preview_page_count']}');
  late Set<int> _genreIds = {for (final g in widget.story['genres'] as List) (g as Map)['id'] as int};
  late int? _columnId = (widget.story['column'] as Map?)?['id'] as int?;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_title, _author, _synopsis, _price, _preview]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cover = widget.story['cover_image'] as String?;
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text('Story settings', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 16),
      TextField(controller: _title, decoration: const InputDecoration(labelText: 'Title', border: OutlineInputBorder())),
      const SizedBox(height: 12),
      TextField(controller: _author, decoration: const InputDecoration(labelText: 'Author', border: OutlineInputBorder())),
      const SizedBox(height: 12),
      TextField(
        controller: _synopsis,
        maxLines: 4,
        decoration: const InputDecoration(labelText: 'Synopsis', border: OutlineInputBorder()),
      ),
      const SizedBox(height: 16),
      Row(children: [
        if (cover != null && cover.isNotEmpty)
          Padding(padding: const EdgeInsets.only(right: 12), child: Image.network(cover, height: 72)),
        OutlinedButton.icon(onPressed: widget.onUploadCover, icon: const Icon(Icons.image_outlined), label: const Text('Upload cover')),
      ]),
      const SizedBox(height: 16),
      const Text('Genres'),
      const SizedBox(height: 8),
      GenreChipSelector(genres: widget.genres, selected: _genreIds, onChanged: (s) => setState(() => _genreIds = s)),
      const SizedBox(height: 16),
      DropdownButtonFormField<int?>(
        initialValue: _columnId,
        decoration: const InputDecoration(labelText: 'Column', border: OutlineInputBorder()),
        items: [
          const DropdownMenuItem(value: null, child: Text('Standalone (no column)')),
          for (final c in widget.columns)
            DropdownMenuItem(value: c.id, child: Text('${c.title}${c.isPublic ? ' (public, free)' : ''}')),
        ],
        onChanged: (v) => setState(() => _columnId = v),
      ),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(
          child: TextField(
            controller: _price,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Price (₱)', helperText: '0 = free · min ₱20', border: OutlineInputBorder()),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: TextField(
            controller: _preview,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Free preview', helperText: 'paragraphs', border: OutlineInputBorder()),
          ),
        ),
      ]),
      const SizedBox(height: 20),
      BusyButton(
        busy: _busy,
        label: 'Save settings',
        onPressed: () async {
          setState(() => _busy = true);
          await widget.onSave({
            'title': _title.text.trim(),
            'author_name': _author.text.trim(),
            'synopsis': _synopsis.text.trim(),
            'genre_ids': _genreIds.toList(),
            'column_id': _columnId,
            'price': _price.text.trim().isEmpty ? '0' : _price.text.trim(),
            'preview_page_count': int.tryParse(_preview.text.trim()) ?? 3,
          });
          if (mounted) setState(() => _busy = false);
        },
      ),
    ]);
  }
}
