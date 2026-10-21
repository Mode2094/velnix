import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/live/directory_panel.dart';
import 'package:velnix/live/gateway.dart';

void main() {
  late VelnixGateway previous;
  setUp(() => previous = VelnixGateway.instance);
  tearDown(() => VelnixGateway.instance = previous);
  testWidgets('loads the next cursor page and search starts a fresh list', (
    tester,
  ) async {
    final calls = <Map<String, dynamic>>[];
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      calls.add({...data});
      final searching = data['query'] == 'جديد';
      return {
        'items': [
          {
            'id': searching
                ? 'new'
                : data['afterId'] == null
                ? 'first'
                : 'second',
            'name': searching
                ? 'نتيجة جديدة'
                : data['afterId'] == null
                ? 'أول موظف'
                : 'ثاني موظف',
          },
        ],
        'more': !searching && data['afterId'] == null,
        'afterId': data['afterId'] == null ? 'first' : 'second',
      };
    });
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: DirectoryPanel(
            endpoint: 'listMembers',
            builder: (rows) => ListView(
              children: rows.map((row) => Text(row['name'] as String)).toList(),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('أول موظف'), findsOneWidget);
    // Editing a draft must not combine a new query with the old page cursor.
    await tester.enterText(find.byType(TextField), 'جديد');
    await tester.tap(find.text('تحميل المزيد'));
    await tester.pumpAndSettle();
    expect(find.text('ثاني موظف'), findsOneWidget);
    expect(calls[1]['afterId'], 'first');
    expect(calls[1]['query'], '');
    await tester.enterText(find.byType(TextField), 'جديد');
    await tester.tap(find.byTooltip('بحث'));
    await tester.pumpAndSettle();
    expect(find.text('نتيجة جديدة'), findsOneWidget);
    expect(find.text('أول موظف'), findsNothing);
    expect(calls.last.containsKey('afterId'), isFalse);
  });
  testWidgets(
    'failed refresh discards privileged cached rows and offers retry',
    (tester) async {
      bool fail = false;
      VelnixGateway.instance = VelnixGateway.forTesting((_, _) async {
        if (fail) throw VelnixException('سحبت الصلاحية');
        return {
          'items': [
            {'id': 'private', 'name': 'اسم خاص'},
          ],
        };
      });
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: DirectoryPanel(
              endpoint: 'listMembers',
              builder: (rows) => ListView(
                children: rows
                    .map((row) => Text(row['name'] as String))
                    .toList(),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('اسم خاص'), findsOneWidget);
      fail = true;
      await tester.tap(find.byTooltip('تحديث القائمة'));
      await tester.pumpAndSettle();
      expect(find.text('اسم خاص'), findsNothing);
      expect(find.text('إعادة المحاولة'), findsOneWidget);
    },
  );
  test('selector walks all pages and refuses nonadvancing cursors', () async {
    int calls = 0;
    final gateway = VelnixGateway.forTesting((_, data) async {
      calls++;
      return {
        'items': List.generate(
          calls == 1 ? 100 : 37,
          (i) => {'id': '${calls}_$i'},
        ),
        'more': calls == 1,
        'afterId': 'page_$calls',
      };
    });
    expect((await gateway.directoryItems('listCompanies')).length, 137);
    expect(calls, 2);
    final invalid = VelnixGateway.forTesting(
      (_, _) async => {'items': [], 'more': true, 'afterId': 'same'},
    );
    await expectLater(
      invalid.directoryItems('listCompanies'),
      throwsA(isA<VelnixException>()),
    );
  });
}
