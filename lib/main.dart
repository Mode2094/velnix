import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'live/live_app.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'core/theme.dart';
import 'data/demo_store.dart';
import 'screens/login_screen.dart';
import 'screens/shell_screen.dart';

/// Launch the existing UI preview explicitly with --dart-define=VELNIX_MODE=demo.
/// Default launch uses Firebase Auth and live callable services.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const mode = String.fromEnvironment('VELNIX_MODE', defaultValue: 'live');
  if (mode == 'demo') {
    runApp(const VelnixApp());
    return;
  }
  try {
    const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
    if (apiKey.isNotEmpty) {
      await Firebase.initializeApp(
        options: const FirebaseOptions(
          apiKey: String.fromEnvironment('FIREBASE_API_KEY'),
          appId: String.fromEnvironment('FIREBASE_APP_ID'),
          messagingSenderId: String.fromEnvironment('FIREBASE_SENDER_ID'),
          projectId: String.fromEnvironment('FIREBASE_PROJECT_ID'),
          authDomain: String.fromEnvironment('FIREBASE_AUTH_DOMAIN'),
        ),
      );
    } else {
      await Firebase.initializeApp();
    }
    const webSiteKey = String.fromEnvironment('FIREBASE_APPCHECK_SITE_KEY');
    const debugAppCheck = bool.fromEnvironment('VELNIX_DEBUG_APPCHECK');
    if (debugAppCheck && kReleaseMode) {
      throw StateError('App Check debug غير مسموح في إصدار الإنتاج');
    }
    if (kIsWeb && webSiteKey.isEmpty) {
      throw StateError('FIREBASE_APPCHECK_SITE_KEY مطلوب لنسخة الويب الحية');
    }
    if (!kIsWeb || webSiteKey.isNotEmpty) {
      await FirebaseAppCheck.instance.activate(
        providerAndroid: debugAppCheck
            ? const AndroidDebugProvider()
            : const AndroidPlayIntegrityProvider(),
        providerApple: debugAppCheck
            ? const AppleDebugProvider()
            : const AppleDeviceCheckProvider(),
        providerWeb: kIsWeb ? ReCaptchaV3Provider(webSiteKey) : null,
      );
    }
    runApp(const VelnixLiveApp());
  } catch (e) {
    runApp(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'تعذر تهيئة Firebase. تحقق من إعدادات المشروع وApp Check.\n$e',
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class VelnixApp extends StatefulWidget {
  const VelnixApp({super.key});
  @override
  State<VelnixApp> createState() => _VelnixAppState();
}

class _VelnixAppState extends State<VelnixApp> {
  final DemoStore _store = DemoStore();
  bool _loggedIn = false;
  @override
  void dispose() {
    _store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => StoreScope(
    store: _store,
    child: MaterialApp(
      title: 'Velnix – Smart Order Management',
      debugShowCheckedModeBanner: false,
      theme: velnixTheme(),
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child ?? const SizedBox.shrink(),
      ),
      home: _loggedIn
          ? ShellScreen(onLogout: () => setState(() => _loggedIn = false))
          : LoginScreen(onDemoLogin: () => setState(() => _loggedIn = true)),
    ),
  );
}
