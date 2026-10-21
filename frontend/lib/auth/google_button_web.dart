import 'package:flutter/widgets.dart';
import 'package:google_sign_in_web/web_only.dart' as web;

/// On the web, Google Identity Services requires its own rendered button to
/// issue an ID token; the result arrives through onCurrentUserChanged.
Widget? buildGoogleWebButton() => web.renderButton();
