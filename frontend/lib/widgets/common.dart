import 'package:flutter/material.dart';

import '../api/models.dart';

void showError(BuildContext context, Object error) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$error'.replaceFirst('Exception: ', ''))));
}

void showMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}

/// Centered, width-limited column used by the auth and onboarding screens.
class NarrowBody extends StatelessWidget {
  const NarrowBody({super.key, required this.children, this.maxWidth = 420});

  final List<Widget> children;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
        ),
      ),
    );
  }
}

class BusyButton extends StatelessWidget {
  const BusyButton({super.key, required this.busy, required this.onPressed, required this.label});

  final bool busy;
  final VoidCallback? onPressed;
  final String label;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: busy ? null : onPressed,
      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
      child: busy
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
          : Text(label),
    );
  }
}

/// Selectable genre chips in the genre's own colour.
class GenreChipSelector extends StatelessWidget {
  const GenreChipSelector({super.key, required this.genres, required this.selected, required this.onChanged});

  final List<Genre> genres;
  final Set<int> selected;
  final ValueChanged<Set<int>> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(spacing: 8, runSpacing: 8, children: [
      for (final genre in genres)
        FilterChip(
          label: Text(genre.name),
          selected: selected.contains(genre.id),
          selectedColor: genre.color.withValues(alpha: 0.25),
          side: BorderSide(color: genre.color.withValues(alpha: 0.6)),
          onSelected: (on) => onChanged(on ? {...selected, genre.id} : ({...selected}..remove(genre.id))),
        ),
    ]);
  }
}

class GenreTags extends StatelessWidget {
  const GenreTags({super.key, required this.genres});
  final List<Genre> genres;

  @override
  Widget build(BuildContext context) {
    return Wrap(spacing: 6, runSpacing: 4, children: [
      for (final g in genres)
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: g.color.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(g.name, style: TextStyle(fontSize: 12, color: g.color)),
        ),
    ]);
  }
}
