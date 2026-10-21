import 'package:flutter/material.dart';

Color _hex(String? value, Color fallback) {
  if (value == null || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(value)) return fallback;
  return Color(int.parse('FF${value.substring(1)}', radix: 16));
}

class Genre {
  Genre({required this.id, required this.name, required this.slug, this.description = '', this.colorHex, this.isActive = true});

  factory Genre.fromJson(Map<String, dynamic> j) => Genre(
        id: j['id'] as int,
        name: j['name'] as String,
        slug: j['slug'] as String,
        description: (j['description'] ?? '') as String,
        colorHex: j['color'] as String?,
        isActive: (j['is_active'] ?? true) as bool,
      );

  final int id;
  final String name;
  final String slug;
  final String description;
  final String? colorHex;
  final bool isActive;

  Color get color => _hex(colorHex, Colors.deepPurple);

  @override
  bool operator ==(Object other) => other is Genre && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

class AppUser {
  AppUser.fromJson(Map<String, dynamic> j)
      : id = j['id'] as int,
        email = j['email'] as String,
        displayName = (j['display_name'] ?? '') as String,
        avatarUrl = (j['avatar_url'] ?? '') as String,
        authProvider = (j['auth_provider'] ?? 'email') as String,
        isAdmin = (j['is_admin'] ?? false) as bool,
        onboarded = (j['onboarded'] ?? false) as bool,
        theme = (j['theme'] ?? 'light') as String,
        readingMode = (j['reading_mode'] ?? 'scroll') as String,
        preferredGenres = [
          for (final g in (j['preferred_genres'] as List? ?? const [])) Genre.fromJson(g as Map<String, dynamic>)
        ];

  final int id;
  final String email;
  final String displayName;
  final String avatarUrl;
  final String authProvider;
  final bool isAdmin;
  final bool onboarded;
  final String theme;

  /// "book" (swipe through pages) or "scroll" (one long page).
  final String readingMode;
  final List<Genre> preferredGenres;

  String get label => displayName.isNotEmpty ? displayName : email;
}

class ColumnInfo {
  ColumnInfo.fromJson(Map<String, dynamic> j)
      : id = j['id'] as int,
        title = j['title'] as String,
        slug = j['slug'] as String,
        description = (j['description'] ?? '') as String,
        isPublic = (j['is_public'] ?? false) as bool;

  final int id;
  final String title;
  final String slug;
  final String description;
  final bool isPublic;
}

class StorySummary {
  StorySummary.fromJson(Map<String, dynamic> j)
      : id = j['id'] as int,
        title = j['title'] as String,
        slug = j['slug'] as String,
        authorName = (j['author_name'] ?? '') as String,
        synopsis = (j['synopsis'] ?? '') as String,
        coverImage = j['cover_image'] as String?,
        column = j['column'] == null ? null : ColumnInfo.fromJson(j['column'] as Map<String, dynamic>),
        genres = [for (final g in (j['genres'] as List? ?? const [])) Genre.fromJson(g as Map<String, dynamic>)],
        price = double.tryParse('${j['price']}') ?? 0,
        isFree = (j['is_free'] ?? false) as bool,
        previewPageCount = (j['preview_page_count'] ?? 3) as int,
        wordCount = (j['word_count'] ?? 0) as int,
        viewCount = (j['view_count'] ?? 0) as int,
        readerCount = (j['reader_count'] ?? 0) as int,
        chapterCount = (j['chapter_count'] ?? 0) as int,
        status = (j['status'] ?? 'published') as String;

  final int id;
  final String title;
  final String slug;
  final String authorName;
  final String synopsis;
  final String? coverImage;
  final ColumnInfo? column;
  final List<Genre> genres;
  final double price;
  final bool isFree;
  final int previewPageCount;
  final int wordCount;
  final int viewCount;
  final int readerCount;
  final int chapterCount;
  final String status;

  bool get isPublished => status == 'published';
  String get priceLabel => isFree ? 'Free' : '₱${price.toStringAsFixed(2)}';
}

class ReaderChapter {
  ReaderChapter.fromJson(Map<String, dynamic> j)
      : id = j['id'] as int,
        title = (j['title'] ?? '') as String,
        content = j['content'] as List?,
        locked = (j['locked'] ?? false) as bool,
        wordCount = (j['word_count'] ?? 0) as int;

  final int id;
  final String title;

  /// Quill Delta ops, or null when the whole chapter is behind the paywall.
  final List? content;
  final bool locked;
  final int wordCount;
}

class StoryDetail {
  StoryDetail.fromJson(Map<String, dynamic> j)
      : summary = StorySummary.fromJson(j),
        chapters = [for (final c in (j['chapters'] as List)) ReaderChapter.fromJson(c as Map<String, dynamic>)],
        locked = (j['locked'] ?? false) as bool,
        hasAccess = (j['has_access'] ?? false) as bool;

  final StorySummary summary;
  final List<ReaderChapter> chapters;
  final bool locked;
  final bool hasAccess;
}
