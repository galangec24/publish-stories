import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../widgets/common.dart';
import 'story_studio.dart';

class _PendingFile {
  _PendingFile(this.name, this.bytes);
  final String name;
  final List<int> bytes;
  final title = TextEditingController();

  /// null = use the batch genres; otherwise these genres replace them for this file.
  Set<int>? genreIds;
}

/// Upload many manuscripts (.docx / .md / .txt) at once, tag genres for the
/// whole batch or per file, and get a draft story per file.
class BulkImportScreen extends StatefulWidget {
  const BulkImportScreen({super.key});

  @override
  State<BulkImportScreen> createState() => _BulkImportScreenState();
}

class _BulkImportScreenState extends State<BulkImportScreen> {
  final List<_PendingFile> _files = [];
  List<Genre> _genres = [];
  List<ColumnInfo> _columns = [];
  Set<int> _batchGenres = {};
  int? _columnId;
  final _price = TextEditingController(text: '0');
  final _preview = TextEditingController(text: '3');
  bool _publish = false;
  bool _createMissingGenres = false;
  bool _busy = false;
  Map<String, dynamic>? _result;

  @override
  void initState() {
    super.initState();
    final api = context.read<ApiClient>();
    Future.wait([api.get('admin/genres/'), api.get('admin/columns/')]).then((r) {
      if (!mounted) return;
      setState(() {
        _genres = [for (final g in r[0] as List) Genre.fromJson(g as Map<String, dynamic>)];
        _columns = [for (final c in r[1] as List) ColumnInfo.fromJson(c as Map<String, dynamic>)];
      });
    }).catchError((Object e) {
      if (mounted) showError(context, e);
    });
  }

  @override
  void dispose() {
    _price.dispose();
    _preview.dispose();
    for (final f in _files) {
      f.title.dispose();
    }
    super.dispose();
  }

  Future<void> _pick() async {
    final picked = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: const ['docx', 'md', 'markdown', 'txt'],
      withData: true,
    );
    if (picked == null) return;
    setState(() {
      for (final file in picked.files) {
        if (file.bytes != null && !_files.any((f) => f.name == file.name)) {
          _files.add(_PendingFile(file.name, file.bytes!));
        }
      }
      _result = null;
    });
  }

  Future<void> _editFileGenres(_PendingFile file) async {
    var selected = {...(file.genreIds ?? _batchGenres)};
    final save = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: Text('Genres for ${file.name}'),
          content: SizedBox(
            width: 420,
            child: GenreChipSelector(genres: _genres, selected: selected, onChanged: (s) => setLocal(() => selected = s)),
          ),
          actions: [
            TextButton(
              onPressed: () {
                file.genreIds = null;
                Navigator.of(context).pop(false);
              },
              child: const Text('Use batch genres'),
            ),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Apply')),
          ],
        ),
      ),
    );
    setState(() {
      if (save == true) file.genreIds = selected;
    });
  }

  Future<void> _upload() async {
    if (_files.isEmpty) return;
    setState(() => _busy = true);
    final manifest = [
      for (final f in _files)
        {
          'filename': f.name,
          if (f.title.text.trim().isNotEmpty) 'title': f.title.text.trim(),
          if (f.genreIds != null) 'genre_ids': f.genreIds!.toList(),
        }
    ];
    try {
      final result = await context.read<ApiClient>().multipart('admin/stories/import/',
          fields: {
            'genre_ids': _batchGenres.join(','),
            if (_columnId != null) 'column_id': '$_columnId',
            'price': _price.text.trim().isEmpty ? '0' : _price.text.trim(),
            'preview_page_count': _preview.text.trim().isEmpty ? '3' : _preview.text.trim(),
            'status': _publish ? 'published' : 'draft',
            'create_missing_genres': '$_createMissingGenres',
            'manifest': jsonEncode(manifest),
          },
          files: [for (final f in _files) UploadFile(f.name, f.bytes)]);
      setState(() {
        _result = result as Map<String, dynamic>;
        _files.removeWhere((f) => (_result!['results'] as List).any((r) => r['filename'] == f.name && r['ok'] == true));
      });
    } on ApiException catch (e) {
      // 400 with per-file results means every file failed; show them anyway.
      if (e.body is Map && (e.body as Map).containsKey('results')) {
        setState(() => _result = Map<String, dynamic>.from(e.body as Map));
      } else if (mounted) {
        showError(context, e);
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final genreNames = {for (final g in _genres) g.id: g.name};
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text('Bulk import', style: Theme.of(context).textTheme.titleLarge),
      const Text('Each file becomes a story. Word "Heading 1" paragraphs, Markdown "# " headings, or lines like '
          '"Chapter 1" / "Kabanata 1" in text files start a new chapter. Markdown front matter '
          '(title, author, synopsis, genres) is read automatically.'),
      const SizedBox(height: 16),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Applies to every file', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            const Text('Genre tags'),
            const SizedBox(height: 8),
            GenreChipSelector(genres: _genres, selected: _batchGenres, onChanged: (s) => setState(() => _batchGenres = s)),
            const SizedBox(height: 16),
            Wrap(spacing: 12, runSpacing: 12, children: [
              SizedBox(
                width: 260,
                child: DropdownButtonFormField<int?>(
                  initialValue: _columnId,
                  decoration: const InputDecoration(labelText: 'Column', border: OutlineInputBorder()),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('Standalone')),
                    for (final c in _columns) DropdownMenuItem(value: c.id, child: Text(c.title)),
                  ],
                  onChanged: (v) => setState(() => _columnId = v),
                ),
              ),
              SizedBox(
                width: 140,
                child: TextField(
                  controller: _price,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Price (₱)', border: OutlineInputBorder()),
                ),
              ),
              SizedBox(
                width: 160,
                child: TextField(
                  controller: _preview,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Preview paragraphs', border: OutlineInputBorder()),
                ),
              ),
            ]),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Publish immediately'),
              subtitle: const Text('Off: stories are created as drafts for review in the Studio'),
              value: _publish,
              onChanged: (v) => setState(() => _publish = v),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Create genres named in front matter if they don\'t exist'),
              value: _createMissingGenres,
              onChanged: (v) => setState(() => _createMissingGenres = v),
            ),
          ]),
        ),
      ),
      const SizedBox(height: 16),
      Row(children: [
        OutlinedButton.icon(onPressed: _busy ? null : _pick, icon: const Icon(Icons.attach_file), label: const Text('Choose files')),
        const SizedBox(width: 12),
        Text('${_files.length} file${_files.length == 1 ? '' : 's'} selected'),
        const Spacer(),
        FilledButton.icon(
          onPressed: _busy || _files.isEmpty ? null : _upload,
          icon: _busy
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.cloud_upload_outlined),
          label: const Text('Import'),
        ),
      ]),
      const SizedBox(height: 8),
      for (final f in _files)
        Card(
          child: ListTile(
            leading: Icon(f.name.endsWith('.docx') ? Icons.description_outlined : Icons.article_outlined),
            title: TextField(
              controller: f.title,
              decoration: InputDecoration(isDense: true, hintText: 'Title (blank = from file)', helperText: f.name),
            ),
            subtitle: Text(f.genreIds == null
                ? 'Genres: batch'
                : 'Genres: ${f.genreIds!.map((id) => genreNames[id] ?? '?').join(', ')}'),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              IconButton(tooltip: 'Genres for this file', icon: const Icon(Icons.local_offer_outlined), onPressed: () => _editFileGenres(f)),
              IconButton(
                tooltip: 'Remove',
                icon: const Icon(Icons.close),
                onPressed: () => setState(() {
                  f.title.dispose();
                  _files.remove(f);
                }),
              ),
            ]),
          ),
        ),
      if (_result != null) ...[
        const SizedBox(height: 16),
        Text('Imported ${_result!['created']} · failed ${_result!['failed']}', style: Theme.of(context).textTheme.titleMedium),
        for (final r in _result!['results'] as List)
          ListTile(
            leading: Icon(r['ok'] == true ? Icons.check_circle : Icons.error_outline,
                color: r['ok'] == true ? Colors.green : Theme.of(context).colorScheme.error),
            title: Text(r['ok'] == true ? '${r['title']}  (${r['filename']})' : '${r['filename']}'),
            subtitle: Text(r['ok'] == true
                ? [
                    '${r['chapters']} chapters · ${r['word_count']} words · ${r['status']}',
                    if ((r['genres'] as List).isNotEmpty) (r['genres'] as List).join(', '),
                    ...(r['warnings'] as List).map((w) => '⚠ $w'),
                  ].join('\n')
                : '${r['error']}'),
            trailing: r['ok'] == true
                ? TextButton(
                    onPressed: () => Navigator.of(context)
                        .push(MaterialPageRoute(builder: (_) => StoryStudio(storyId: r['story_id'] as int))),
                    child: const Text('Open in Studio'),
                  )
                : null,
          ),
      ],
    ]);
  }
}
