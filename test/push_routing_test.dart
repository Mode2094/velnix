import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/live/push_routing.dart';

void main() {
  group('push tap routing', () {
    test('opens the order named by the payload', () {
      expect(PushRouting.orderTarget({'orderId': 'order-1'}), 'order-1');
    });

    test('trims a padded order id instead of navigating with padding', () {
      expect(PushRouting.orderTarget({'orderId': '  order-1  '}), 'order-1');
    });

    test('never invents a destination when the payload has no order', () {
      expect(PushRouting.orderTarget(const {}), isNull);
      expect(PushRouting.orderTarget({'orderId': ''}), isNull);
      expect(PushRouting.orderTarget({'orderId': '   '}), isNull);
      expect(PushRouting.orderTarget({'noticeId': 'n-1'}), isNull);
    });

    test('ignores a non-string order id rather than failing the tap', () {
      expect(PushRouting.orderTarget({'orderId': 42}), isNull);
      expect(PushRouting.orderTarget({'orderId': null}), isNull);
      expect(PushRouting.orderTarget({'orderId': <String>[]}), isNull);
    });
  });

  group('foreground presentation de-duplication', () {
    test('same notice is presented once while retries are suppressed', () {
      final routing = PushRouting();
      expect(routing.shouldPresentForeground('notice-1'), isTrue);
      expect(routing.shouldPresentForeground('notice-1'), isFalse);
      expect(routing.shouldPresentForeground('notice-1'), isFalse);
    });

    test('distinct notices are each presented', () {
      final routing = PushRouting();
      expect(routing.shouldPresentForeground('notice-1'), isTrue);
      expect(routing.shouldPresentForeground('notice-2'), isTrue);
    });

    test('a push without a usable notice id is never dropped', () {
      final routing = PushRouting();
      expect(routing.shouldPresentForeground(null), isTrue);
      expect(routing.shouldPresentForeground(null), isTrue);
      expect(routing.shouldPresentForeground(''), isTrue);
      expect(routing.shouldPresentForeground(7), isTrue);
    });
  });
}
