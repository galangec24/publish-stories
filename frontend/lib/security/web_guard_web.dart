import 'dart:js_interop';

import 'package:web/web.dart' as web;

bool _enabled = false;
void Function(bool hidden)? _onChange;

void _update(bool hidden) {
  if (_enabled) _onChange?.call(hidden);
}

/// Hide protected content whenever the page might be captured.
///
/// Snipping Tool (Win+Shift+S), the macOS screenshot UI and switching tabs all
/// take focus from the page, so "blur" covers the story before it can be grabbed
/// in most cases. Print Screen is caught on keyup (browsers don't deliver keydown
/// for it) and the clipboard is overwritten.
void install(void Function(bool hidden) onChange) {
  _onChange = onChange;
  web.window.addEventListener('blur', ((web.Event _) => _update(true)).toJS);
  web.window.addEventListener('focus', ((web.Event _) => _update(false)).toJS);
  web.document.addEventListener('visibilitychange', ((web.Event _) => _update(web.document.hidden)).toJS);

  void onKey(web.KeyboardEvent e) {
    if (!_enabled) return;
    final key = e.key;
    final screenshotCombo = key == 'PrintScreen' ||
        (e.metaKey && e.shiftKey && (key == 'S' || key == 's' || key == '3' || key == '4' || key == '5'));
    final saveOrPrint = (e.ctrlKey || e.metaKey) && (key == 'p' || key == 'P' || key == 's' || key == 'S');
    if (screenshotCombo) {
      _update(true);
      web.window.navigator.clipboard.writeText('Screenshots are disabled for this content.');
      Future.delayed(const Duration(seconds: 2), () => _update(!web.document.hasFocus()));
    }
    if (screenshotCombo || saveOrPrint) e.preventDefault();
  }

  web.window.addEventListener('keydown', ((web.KeyboardEvent e) => onKey(e)).toJS);
  web.window.addEventListener('keyup', ((web.KeyboardEvent e) => onKey(e)).toJS);
  web.document.addEventListener('contextmenu', ((web.Event e) {
    if (_enabled) e.preventDefault();
  }).toJS);
  web.document.addEventListener('copy', ((web.Event e) {
    if (_enabled) e.preventDefault();
  }).toJS);
}

void setEnabled(bool enabled) {
  _enabled = enabled;
  // index.html hides <body> when printing while this class is present.
  web.document.body?.classList.toggle('protected', enabled);
  if (!enabled) _onChange?.call(false);
}
