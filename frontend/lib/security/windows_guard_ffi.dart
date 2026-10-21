import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';

// WDA_EXCLUDEFROMCAPTURE (Windows 10 2004+): the window is left out of every
// capture: Print Screen, Snipping Tool, Game Bar, OBS, Teams/Zoom screen share.
const _wdaNone = 0x0;
const _wdaExcludeFromCapture = 0x11;

typedef _FindWindowNative = IntPtr Function(Pointer<Utf16> className, Pointer<Utf16> windowName);
typedef _FindWindowDart = int Function(Pointer<Utf16> className, Pointer<Utf16> windowName);
typedef _SetAffinityNative = Int32 Function(IntPtr hwnd, Uint32 affinity);
typedef _SetAffinityDart = int Function(int hwnd, int affinity);

/// Window class registered by the default Flutter Windows runner (windows/runner/win32_window.cpp).
const _flutterWindowClass = 'FLUTTER_RUNNER_WIN32_WINDOW';

void setExcludedFromCapture(bool enabled) {
  if (!Platform.isWindows) return;
  final user32 = DynamicLibrary.open('user32.dll');
  final findWindow = user32.lookupFunction<_FindWindowNative, _FindWindowDart>('FindWindowW');
  final setAffinity = user32.lookupFunction<_SetAffinityNative, _SetAffinityDart>('SetWindowDisplayAffinity');

  final className = _flutterWindowClass.toNativeUtf16();
  try {
    final hwnd = findWindow(className, nullptr);
    if (hwnd != 0) setAffinity(hwnd, enabled ? _wdaExcludeFromCapture : _wdaNone);
  } finally {
    calloc.free(className);
  }
}
