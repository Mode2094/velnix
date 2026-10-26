import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';

Widget app(Widget child) => MaterialApp(
  theme: velnixTheme(),
  locale: const Locale('ar'),
  supportedLocales: const [Locale('ar')],
  localizationsDelegates: const [
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ],
  home: Scaffold(body: child),
);

SessionPolicy gm() =>
    SessionPolicy({'id': 'gm', 'role': 'generalManager', 'active': true});

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);

  Map<String, dynamic> member({
    String id = 'emp1',
    String name = 'موظف تجريبي',
    String role = 'dataEntry',
    bool active = true,
  }) => {
    'id': id,
    'name': name,
    'email': '$id@velnix.test',
    'role': role,
    'active': active,
    'permissions': <String>[],
    'salesSupervisorId': null,
  };

  List<String> calls = [];

  void mockMembers(List<Map<String, dynamic>> members) {
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      calls.add(name);
      if (name == 'listMembers') {
        return {'items': members, 'more': false, 'afterId': null};
      }
      if (name == 'deleteMember') return {'ok': true};
      if (name == 'listOrderCreators') {
        return {'items': <dynamic>[], 'more': false, 'afterId': null};
      }
      throw StateError(name);
    });
  }

  testWidgets('a general manager sees a delete control and gets a confirm', (
    tester,
  ) async {
    calls = [];
    mockMembers([member()]);
    await tester.pumpWidget(app(LiveMembers(policy: gm())));
    await tester.pumpAndSettle();
    expect(find.text('موظف تجريبي'), findsOneWidget);
    expect(find.byType(PopupMenuButton<String>), findsOneWidget);
    // Open the row menu and choose delete.
    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حذف الموظف'));
    await tester.pumpAndSettle();
    expect(find.text('حذف الموظف'), findsWidgets);
    expect(
      find.textContaining('لا تُحذف الطلبات أو سجل التدقيق'),
      findsOneWidget,
    );
    expect(calls.where((c) => c == 'deleteMember'), isEmpty);
    // Confirming calls the backend with the member id.
    final dialog = find.byType(AlertDialog);
    await tester.tap(find.descendant(of: dialog, matching: find.text('حذف')));
    await tester.pumpAndSettle();
    expect(calls.where((c) => c == 'deleteMember').length, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('cancelling the confirmation never deletes', (tester) async {
    calls = [];
    mockMembers([member()]);
    await tester.pumpWidget(app(LiveMembers(policy: gm())));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حذف الموظف'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('إلغاء'));
    await tester.pumpAndSettle();
    expect(calls.where((c) => c == 'deleteMember'), isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a general manager cannot delete their own account', (
    tester,
  ) async {
    calls = [];
    mockMembers([
      member(id: 'gm', name: 'المدير العام', role: 'generalManager'),
    ]);
    await tester.pumpWidget(app(LiveMembers(policy: gm())));
    await tester.pumpAndSettle();
    final menu = tester.widget<PopupMenuButton<String>>(
      find.byType(PopupMenuButton<String>),
    );
    expect(menu.enabled, isFalse);
    expect(tester.takeException(), isNull);
  });
}
