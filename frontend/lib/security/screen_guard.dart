import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'web_guard_stub.dart' if (dart.library.js_interop) 'web_guard_web.dart' as web_guard;
import 'windows_guard_stub.dart' if (dart.library.ffi) 'windows_guard_ffi.dart' as windows_guard;

/// Anti-capture protection for story content.
///
/// What each platform can actually do:
///  * Android: FLAG_SECURE. Screenshots and recordings come out black. (MainActivity.kt)
///  * Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE). Snipping Tool,
///    Print Screen, OBS, Teams and Zoom capture an empty area instead of the window.
///  * iOS: screenshots can't be blocked. While the screen is being recorded or
///    mirrored the content is covered, and a screenshot is reported so we can warn.
///    (AppDelegate.swift)
///  * Web: browsers have no API to block capture. The cover is shown whenever the
///    tab is hidden or the window loses focus (Win+Shift+S opens Snipping Tool,
///    which takes focus) and when Print Screen is pressed, and the page clears the
///    clipboard. This deters casual copying but can't stop OS-level tools or a
///    phone camera. The account watermark makes leaks traceable.
class ScreenGuard {
  ScreenGuard._();
  static final instance = ScreenGuard._();

  static const _channel = MethodChannel('story_app/screen_guard');

  /// True while content must be hidden (tab hidden, recording in progress...).
  final hidden = ValueNotifier<bool>(false);

  /// Fires when the OS reports a screenshot was taken (iOS only).
  final screenshots = StreamController<void>.broadcast();

  int _activeScreens = 0;
  bool _installed = false;

  void _install() {
    if (_installed) return;
    _installed = true;
    if (kIsWeb) {
      web_guard.install((isHidden) => hidden.value = isHidden);
      return;
    }
    _channel.setMethodCallHandler((call) async {
      switch (call.method) {
        case 'captureChanged':
          hidden.value = call.arguments == true;
        case 'screenshotTaken':
          screenshots.add(null);
      }
    });
  }

  /// Turn protection on while at least one protected screen is visible.
  Future<void> acquire() async {
    _install();
    if (_activeScreens++ > 0) return;
    await _setNative(true);
  }

  Future<void> release() async {
    if (_activeScreens == 0 || --_activeScreens > 0) return;
    await _setNative(false);
  }

  Future<void> _setNative(bool enabled) async {
    if (kIsWeb) {
      web_guard.setEnabled(enabled);
      return;
    }
    if (defaultTargetPlatform == TargetPlatform.windows) {
      windows_guard.setExcludedFromCapture(enabled);
      return;
    }
    try {
      await _channel.invokeMethod(enabled ? 'enable' : 'disable');
    } on MissingPluginException {
      // Platform without native support (e.g. Linux); the web-style cover still applies.
    }
  }
}

/// Wrap any widget whose content must not be captured.
class ProtectedContent extends StatefulWidget {
  const ProtectedContent({super.key, required this.child, this.watermark});

  final Widget child;

  /// Usually the reader's email; tiled faintly over the content.
  final String? watermark;

  @override
  State<ProtectedContent> createState() => _ProtectedContentState();
}

class _ProtectedContentState extends State<ProtectedContent> {
  StreamSubscription<void>? _screenshots;

  @override
  void initState() {
    super.initState();
    ScreenGuard.instance.acquire();
    _screenshots = ScreenGuard.instance.screenshots.stream.listen((_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Screenshots of stories aren\'t allowed. Please respect the author\'s work.'),
      ));
    });
  }

  @override
  void dispose() {
    _screenshots?.cancel();
    ScreenGuard.instance.release();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: ScreenGuard.instance.hidden,
      builder: (context, isHidden, child) => Stack(
        children: [
          // Keep the subtree alive so scroll position survives, but don't paint it.
          Offstage(offstage: isHidden, child: child),
          if (widget.watermark != null && !isHidden)
            Positioned.fill(child: IgnorePointer(child: _Watermark(text: widget.watermark!))),
          if (isHidden) const Positioned.fill(child: _PrivacyCover()),
        ],
      ),
      child: SelectionContainer.disabled(child: widget.child),
    );
  }
}

class _PrivacyCover extends StatelessWidget {
  const _PrivacyCover();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ColoredBox(
      color: scheme.surface,
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.visibility_off_outlined, size: 48, color: scheme.outline),
          const SizedBox(height: 12),
          Text('Content hidden', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text('Return to this window to keep reading.', style: TextStyle(color: scheme.outline)),
        ]),
      ),
    );
  }
}

class _Watermark extends StatelessWidget {
  const _Watermark({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.05);
    return ClipRect(
      child: LayoutBuilder(builder: (context, box) {
        const step = 220.0;
        final rows = (box.maxHeight / 120).ceil() + 1;
        final cols = (box.maxWidth / step).ceil() + 1;
        return Stack(children: [
          for (var r = 0; r < rows; r++)
            for (var c = 0; c < cols; c++)
              Positioned(
                left: c * step + (r.isOdd ? step / 2 : 0) - 40,
                top: r * 120.0,
                child: Transform.rotate(
                  angle: -0.4,
                  child: Text(text, style: TextStyle(color: color, fontSize: 14, fontWeight: FontWeight.w600)),
                ),
              ),
        ]);
      }),
    );
  }
}
