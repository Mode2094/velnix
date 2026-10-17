import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);
  Widget app(Widget child) => MaterialApp(
    home: Directionality(textDirection: TextDirection.rtl, child: child),
  );
  final manager = SessionPolicy({
    'id': 'gm',
    'role': 'generalManager',
    'active': true,
  });

  testWidgets('Live login offers only Google, without passwords or reset', (
    tester,
  ) async {
    await tester.pumpWidget(app(const LiveLogin()));
    expect(find.text('المتابعة باستخدام Google'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(find.text('نسيت كلمة المرور؟'), findsNothing);
    expect(find.text('دخول إلى مساحة العمل'), findsNothing);
  });

  testWidgets(
    'pending rejected and disabled screens expose no internal workspace',
    (tester) async {
      for (final status in ['pending', 'rejected', 'disabled']) {
        var refresh = 0;
        await tester.pumpWidget(
          app(
            JoinStatusScreen(
              status: status,
              onRefresh: () => refresh++,
              onSignOut: () {},
            ),
          ),
        );
        expect(find.byType(LiveShell), findsNothing);
        await tester.tap(find.text('تحديث حالة الحساب'));
        expect(refresh, 1);
        if (status == 'pending') {
          expect(find.text('حسابك بانتظار موافقة المدير'), findsOneWidget);
        }
      }
    },
  );

  testWidgets(
    'general manager sees request identity and approves role without creating a password',
    (tester) async {
      Map<String, dynamic>? decision;
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        if (name == 'listMembers') return {'items': []};
        if (name == 'listJoinRequests') {
          return {
            'items': [
              {'id': 'new', 'name': 'طالب انضمام', 'email': 'new@example.test'},
            ],
          };
        }
        if (name == 'decideJoinRequest') {
          decision = data;
          return {'ok': true};
        }
        throw StateError(name);
      });
      await tester.pumpWidget(app(LiveJoinRequests(policy: manager)));
      await tester.pumpAndSettle();
      expect(find.text('new@example.test'), findsOneWidget);
      await tester.tap(find.text('مراجعة واعتماد'));
      await tester.pumpAndSettle();
      expect(find.byType(SwitchListTile), findsNothing);
      expect(find.textContaining('كلمة مرور'), findsNothing);
      final save = find.widgetWithText(FilledButton, 'حفظ الموظف');
      await tester.ensureVisible(save);
      await tester.tap(save);
      await tester.pumpAndSettle();
      expect(decision?['id'], 'new');
      expect(decision?['decision'], 'approved');
      expect(decision?['role'], 'dataEntry');
      expect(decision?.containsKey('password'), false);
    },
  );

  testWidgets(
    'rejection requires confirmation and server failure preserves the request',
    (tester) async {
      var attempts = 0;
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        if (name == 'listJoinRequests') {
          return {
            'items': [
              {'id': 'new', 'name': 'طالب', 'email': 'new@example.test'},
            ],
          };
        }
        if (name == 'decideJoinRequest') {
          attempts++;
          throw VelnixException('تعذر حفظ القرار');
        }
        throw StateError(name);
      });
      await tester.pumpWidget(app(LiveJoinRequests(policy: manager)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('رفض'));
      // The busy indicator animates while the confirmation awaits a decision.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('رفض طلب الانضمام؟'), findsOneWidget);
      expect(attempts, 0);
      await tester.tap(find.text('تراجع'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('رفض'));
      // The busy indicator animates while the confirmation awaits a decision.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('رفض طلب الانضمام؟'), findsOneWidget);
      await tester.tap(find.text('تأكيد الرفض'));
      await tester.pumpAndSettle();
      expect(attempts, 1);
      expect(find.text('new@example.test'), findsOneWidget);
      expect(find.textContaining('تعذر حفظ القرار'), findsOneWidget);
    },
  );

  testWidgets(
    'a delegated manager has no approval UI and does not request the list',
    (tester) async {
      VelnixGateway.instance = VelnixGateway.forTesting(
        (name, data) async => throw StateError('Must not call $name'),
      );
      await tester.pumpWidget(
        app(
          LiveJoinRequests(
            policy: SessionPolicy({
              'id': 'manager',
              'role': 'manager',
              'active': true,
              'permissions': ['manageEmployees'],
            }),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('الصلاحية غير متاحة'), findsOneWidget);
      expect(find.text('مراجعة واعتماد'), findsNothing);
    },
  );
}
