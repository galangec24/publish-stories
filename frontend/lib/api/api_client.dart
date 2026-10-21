import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../config.dart';

class ApiException implements Exception {
  ApiException(this.status, this.body);

  final int status;
  final dynamic body;

  /// Machine-readable code some endpoints return, e.g. "email_not_verified".
  String? get code => body is Map ? body['code'] as String? : null;

  /// A human-readable message pulled from DRF's error shapes.
  String get message {
    final b = body;
    if (b is Map) {
      if (b['detail'] is String) return b['detail'] as String;
      for (final value in b.values) {
        if (value is List && value.isNotEmpty) return value.first.toString();
        if (value is String) return value;
      }
    }
    if (b is String && b.isNotEmpty && b.length < 200) return b;
    return 'Something went wrong ($status).';
  }

  @override
  String toString() => message;
}

class UploadFile {
  UploadFile(this.filename, this.bytes);
  final String filename;
  final List<int> bytes;
}

/// JSON client that holds the JWT pair and refreshes the access token on 401.
class ApiClient {
  ApiClient({String? baseUrl}) : baseUrl = baseUrl ?? AppConfig.apiBaseUrl;

  final String baseUrl;
  final _storage = const FlutterSecureStorage();
  final _http = http.Client();
  String? _access;
  String? _refresh;
  Future<bool>? _refreshing;

  /// Called when the refresh token is rejected and the user must sign in again.
  void Function()? onSessionExpired;

  bool get hasSession => _refresh != null;
  String? get refreshToken => _refresh;

  Future<void> loadTokens() async {
    _access = await _storage.read(key: 'access');
    _refresh = await _storage.read(key: 'refresh');
  }

  Future<void> saveTokens(String access, String refresh) async {
    _access = access;
    _refresh = refresh;
    await _storage.write(key: 'access', value: access);
    await _storage.write(key: 'refresh', value: refresh);
  }

  Future<void> clearTokens() async {
    _access = null;
    _refresh = null;
    await _storage.delete(key: 'access');
    await _storage.delete(key: 'refresh');
  }

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final clean = path.startsWith('/') ? path.substring(1) : path;
    final params = <String, dynamic>{};
    query?.forEach((key, value) {
      if (value == null) return;
      params[key] = value is List ? value.map((v) => '$v').toList() : '$value';
    });
    return Uri.parse('$baseUrl/$clean').replace(queryParameters: params.isEmpty ? null : params);
  }

  Map<String, String> _headers({bool json = true}) => {
        if (json) 'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (_access != null) 'Authorization': 'Bearer $_access',
      };

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) => _send('GET', path, query: query);
  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body: body);
  Future<dynamic> put(String path, [Object? body]) => _send('PUT', path, body: body);
  Future<dynamic> patch(String path, [Object? body]) => _send('PATCH', path, body: body);
  Future<dynamic> delete(String path) => _send('DELETE', path);

  Future<dynamic> _send(String method, String path,
      {Object? body, Map<String, dynamic>? query, bool retry = true}) async {
    final request = http.Request(method, _uri(path, query))..headers.addAll(_headers());
    if (body != null) request.body = jsonEncode(body);
    final response = await http.Response.fromStream(await _http.send(request));
    if (response.statusCode == 401 && retry && _refresh != null && !path.startsWith('auth/')) {
      if (await _refreshAccess()) return _send(method, path, body: body, query: query, retry: false);
    }
    return _decode(response);
  }

  /// Multipart upload (bulk import, cover images). Repeated fields go comma separated.
  Future<dynamic> multipart(String path,
      {String method = 'POST',
      Map<String, String> fields = const {},
      List<UploadFile> files = const [],
      String fileField = 'files',
      bool retry = true}) async {
    final request = http.MultipartRequest(method, _uri(path))
      ..headers.addAll(_headers(json: false))
      ..fields.addAll(fields);
    for (final file in files) {
      request.files.add(http.MultipartFile.fromBytes(fileField, file.bytes, filename: file.filename));
    }
    final response = await http.Response.fromStream(await _http.send(request));
    if (response.statusCode == 401 && retry && _refresh != null) {
      if (await _refreshAccess()) {
        return multipart(path,
            method: method, fields: fields, files: files, fileField: fileField, retry: false);
      }
    }
    return _decode(response);
  }

  dynamic _decode(http.Response response) {
    final text = utf8.decode(response.bodyBytes);
    dynamic data;
    if (text.isNotEmpty) {
      try {
        data = jsonDecode(text);
      } on FormatException {
        data = text;
      }
    }
    if (response.statusCode >= 400) throw ApiException(response.statusCode, data);
    return data;
  }

  /// Several requests can 401 at once; they share one refresh call.
  Future<bool> _refreshAccess() {
    return _refreshing ??= () async {
      try {
        final response = await _http.post(_uri('auth/token/refresh/'),
            headers: {'Content-Type': 'application/json'}, body: jsonEncode({'refresh': _refresh}));
        if (response.statusCode != 200) {
          await clearTokens();
          onSessionExpired?.call();
          return false;
        }
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        await saveTokens(data['access'] as String, (data['refresh'] ?? _refresh) as String);
        return true;
      } finally {
        _refreshing = null;
      }
    }();
  }
}
