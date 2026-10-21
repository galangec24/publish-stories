import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../state/auth_provider.dart';
import '../../widgets/common.dart';

/// Enter the 6-digit code Brevo delivered.
class VerifyEmailScreen extends StatefulWidget {
  const VerifyEmailScreen({super.key, required this.email});
  final String email;

  @override
  State<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends State<VerifyEmailScreen> {
  final _code = TextEditingController();
  bool _busy = false;
  int _cooldown = 60;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startCooldown();
  }

  void _startCooldown() {
    _timer?.cancel();
    setState(() => _cooldown = 60);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted || _cooldown <= 1) {
        t.cancel();
        if (mounted) setState(() => _cooldown = 0);
        return;
      }
      setState(() => _cooldown--);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (_code.text.length != 6) return;
    setState(() => _busy = true);
    try {
      await context.read<AuthProvider>().verifyEmail(widget.email, _code.text);
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    try {
      await context.read<AuthProvider>().resendCode(widget.email);
      if (mounted) showMessage(context, 'A new code is on its way.');
      _startCooldown();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verify your email')),
      body: NarrowBody(children: [
        const Icon(Icons.mark_email_unread_outlined, size: 56),
        const SizedBox(height: 16),
        Text('Enter the 6-digit code we sent to\n${widget.email}', textAlign: TextAlign.center),
        const SizedBox(height: 24),
        TextField(
          controller: _code,
          autofocus: true,
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          maxLength: 6,
          style: const TextStyle(fontSize: 28, letterSpacing: 12),
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(border: OutlineInputBorder(), counterText: ''),
          onChanged: (v) {
            if (v.length == 6) _verify();
          },
        ),
        const SizedBox(height: 16),
        BusyButton(busy: _busy, onPressed: _verify, label: 'Verify'),
        TextButton(
          onPressed: _cooldown > 0 ? null : _resend,
          child: Text(_cooldown > 0 ? 'Resend code in ${_cooldown}s' : 'Resend code'),
        ),
        const Text('Check your spam folder if it doesn\'t arrive.', textAlign: TextAlign.center),
      ]),
    );
  }
}
