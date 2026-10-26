import 'package:flutter/material.dart';
import 'dart:js_interop';
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:velnix/live/live_app.dart';

@JS('initializeLocalEmulatorAppCheck')
external JSPromise<JSAny?> initializeLocalEmulatorAppCheck();
@JS('initializeLocalEmulatorAuth')
external JSPromise<JSAny?> initializeLocalEmulatorAuth();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const environment = String.fromEnvironment(
    'VELNIX_ENVIRONMENT',
    defaultValue: 'development',
  );
  if (environment != 'development') {
    throw StateError('Synthetic emulator entrypoint is development-only');
  }
  if (!['127.0.0.1', 'localhost'].contains(Uri.base.host)) {
    throw StateError('Emulator preview requires loopback');
  }
  await initializeLocalEmulatorAuth().toDart;
  await Firebase.initializeApp(
    options: const FirebaseOptions(
      apiKey: 'local-emulator-only',
      appId: '1:123456789:web:localpreview',
      messagingSenderId: '123456789',
      projectId: 'demo-velnix-preview',
      authDomain: 'demo-velnix-preview.firebaseapp.com',
    ),
  );
  FirebaseFirestore.instance.useFirestoreEmulator('127.0.0.1', 8080);
  FirebaseFirestore.instance.settings = const Settings(
    persistenceEnabled: false,
  );
  FirebaseFunctions.instanceFor(
    region: 'europe-west1',
  ).useFunctionsEmulator('127.0.0.1', 5001);
  await initializeLocalEmulatorAppCheck().toDart;
  runApp(
    const Directionality(
      textDirection: TextDirection.rtl,
      child: Banner(
        message: 'LOCAL EMULATORS',
        location: BannerLocation.topEnd,
        child: VelnixLiveApp(),
      ),
    ),
  );
}
