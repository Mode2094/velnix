import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/models/entities.dart';

void main() {
  test('normal status labels and primary/error text meet WCAG AA contrast', () {
    double contrast(Color a, Color b) {
      final x = a.computeLuminance(), y = b.computeLuminance();
      return ((x > y ? x : y) + .05) / ((x < y ? x : y) + .05);
    }

    for (final status in OrderStatus.values) {
      final background = Color.alphaBlend(
        status.color.withValues(alpha: .10),
        Colors.white,
      );
      expect(
        contrast(status.color, background),
        greaterThanOrEqualTo(4.5),
        reason: status.name,
      );
    }
    for (final color in [
      VColors.brand,
      VColors.muted,
      VColors.danger,
      VColors.aqua,
    ]) {
      expect(contrast(color, Colors.white), greaterThanOrEqualTo(4.5));
    }
  });
}
