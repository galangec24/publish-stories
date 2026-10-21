import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../auth/google_button_stub.dart' if (dart.library.js_interop) '../../auth/google_button_web.dart';
import '../../state/auth_provider.dart';
import '../../widgets/common.dart';
import 'register_screen.dart';
import 'reset_password_screen.dart';
import 'verify_email_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  late final AuthProvider _auth;

  @override
  void initState() {
    super.initState();
    // Web Google sign-in completes asynchronously via the rendered button.
    _auth = context.read<AuthProvider>()..addListener(_onAuthChanged);
  }

  void _onAuthChanged() {
    final auth = _auth;
    if (!mounted) return;
    if (auth.isSignedIn) {
      Navigator.of(context).popUntil((route) => route.isFirst);
    } else if (auth.lastError != null) {
      showError(context, auth.lastError!);
      auth.lastError = null;
    }
  }

  @override
  void dispose() {
    _auth.removeListener(_onAuthChanged);
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await context.read<AuthProvider>().login(_email.text.trim(), _password.text);
    } on EmailNotVerified catch (e) {
      if (mounted) {
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => VerifyEmailScreen(email: e.email)));
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _google() async {
    setState(() => _busy = true);
    try {
      await context.read<AuthProvider>().signInWithGoogle();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final webButton = kIsWeb ? buildGoogleWebButton() : null;
    return Scaffold(
      appBar: AppBar(title: const Text('Sign in')),
      body: Form(
        key: _form,
        child: NarrowBody(children: [
          Text('Welcome back', style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
          const SizedBox(height: 24),
          if (webButton != null)
            Center(child: webButton)
          else
            OutlinedButton.icon(
              onPressed: _busy ? null : _google,
              icon: const Text('G', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
              label: const Text('Continue with Google'),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 20),
            child: Row(children: [Expanded(child: Divider()), Text('  or  '), Expanded(child: Divider())]),
          ),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
            validator: (v) => (v == null || !v.contains('@')) ? 'Enter your email' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _password,
            obscureText: _obscure,
            autofillHints: const [AutofillHints.password],
            onFieldSubmitted: (_) => _submit(),
            decoration: InputDecoration(
              labelText: 'Password',
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
            validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => ResetPasswordScreen(initialEmail: _email.text.trim()))),
              child: const Text('Forgot password?'),
            ),
          ),
          BusyButton(busy: _busy, onPressed: _submit, label: 'Sign in'),
          const SizedBox(height: 12),
          TextButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RegisterScreen())),
            child: const Text('New here? Create an account'),
          ),
        ]),
      ),
    );
  }
}
