import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../state/auth_provider.dart';
import '../../widgets/common.dart';

class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({super.key, this.initialEmail = ''});
  final String initialEmail;

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  late final _email = TextEditingController(text: widget.initialEmail);
  final _code = TextEditingController();
  final _password = TextEditingController();
  bool _codeSent = false;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('Reset password')),
      body: NarrowBody(children: [
        TextField(
          controller: _email,
          enabled: !_codeSent,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 16),
        if (!_codeSent)
          BusyButton(
            busy: _busy,
            label: 'Send reset code',
            onPressed: () => _run(() async {
              await auth.requestPasswordReset(_email.text.trim());
              setState(() => _codeSent = true);
            }),
          )
        else ...[
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            maxLength: 6,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(labelText: '6-digit code', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _password,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'New password', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 16),
          BusyButton(
            busy: _busy,
            label: 'Set new password',
            onPressed: () => _run(() async {
              await auth.confirmPasswordReset(_email.text.trim(), _code.text, _password.text);
              if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
            }),
          ),
          TextButton(
            onPressed: _busy ? null : () => _run(() => auth.resendCode(_email.text.trim(), purpose: 'reset_password')),
            child: const Text('Send another code'),
          ),
        ],
      ]),
    );
  }
}
