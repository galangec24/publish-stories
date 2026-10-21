import 'package:flutter/material.dart';

import '../api/models.dart';
import '../screens/story_screen.dart';

String compactCount(int n) {
  if (n < 1000) return '$n';
  if (n < 1000000) return '${(n / 1000).toStringAsFixed(n < 10000 ? 1 : 0)}k'.replaceAll('.0k', 'k');
  return '${(n / 1000000).toStringAsFixed(1)}M'.replaceAll('.0M', 'M');
}

class StoryCard extends StatelessWidget {
  const StoryCard({super.key, required this.story, this.width = 160});

  final StorySummary story;
  final double width;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final accent = story.genres.isNotEmpty ? story.genres.first.color : scheme.primary;
    return SizedBox(
      width: width,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () =>
              Navigator.of(context).push(MaterialPageRoute(builder: (_) => StoryScreen(slug: story.slug))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            AspectRatio(
              aspectRatio: 2 / 3,
              child: story.coverImage != null && story.coverImage!.isNotEmpty
                  ? Image.network(story.coverImage!, fit: BoxFit.cover)
                  : Container(
                      color: accent.withValues(alpha: 0.18),
                      padding: const EdgeInsets.all(12),
                      alignment: Alignment.bottomLeft,
                      child: Text(story.title,
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: accent)),
                    ),
            ),
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(story.title, maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(
                  [if (story.genres.isNotEmpty) story.genres.first.name, story.priceLabel].join(' · '),
                  style: TextStyle(fontSize: 12, color: scheme.outline),
                ),
                Text(
                  '${compactCount(story.viewCount)} views · ${compactCount(story.readerCount)} readers',
                  style: TextStyle(fontSize: 11, color: scheme.outline),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class StoryShelf extends StatelessWidget {
  const StoryShelf({super.key, required this.title, required this.stories, this.subtitle});

  final String title;
  final String? subtitle;
  final List<StorySummary> stories;

  @override
  Widget build(BuildContext context) {
    if (stories.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 4),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          if (subtitle != null) Text(subtitle!, style: TextStyle(color: Theme.of(context).colorScheme.outline)),
        ]),
      ),
      SizedBox(
        height: 330,
        child: ListView.separated(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          scrollDirection: Axis.horizontal,
          itemCount: stories.length,
          separatorBuilder: (_, __) => const SizedBox(width: 4),
          itemBuilder: (_, i) => StoryCard(story: stories[i]),
        ),
      ),
    ]);
  }
}
