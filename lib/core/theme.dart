import 'package:flutter/material.dart';

/// Velnix design system: warm off-white, deep ink, electric indigo, and teal.
abstract final class VColors {
  static const navy = Color(0xFF151D3D);
  static const ink = Color(0xFF19243C);
  static const brand = Color(0xFF495BEE);
  static const sky = Color(0xFF7481FC);
  static const aqua = Color(0xFF00AFA5);
  static const canvas = Color(0xFFF5F7FB);
  static const muted = Color(0xFF617189);
  static const line = Color(0xFFE9EDF4);
  static const warning = Color(0xFFF0A23C);
  static const danger = Color(0xFFE85C6C);
  static const violet = Color(0xFF7C65D9);
  static const softBlue = Color(0xFFEFF1FF);
}

ThemeData velnixTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: VColors.brand).copyWith(
    primary: VColors.brand, secondary: VColors.aqua,
    surface: Colors.white, error: VColors.danger,
    onSurface: VColors.ink,
  );
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: scheme,
    scaffoldBackgroundColor: VColors.canvas,
    visualDensity: VisualDensity.standard,
    textTheme: const TextTheme(
      headlineLarge: TextStyle(fontWeight: FontWeight.w900, color: VColors.ink, letterSpacing: -.6),
      headlineSmall: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: VColors.ink),
      titleLarge: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: VColors.ink),
      titleMedium: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: VColors.ink),
      bodyMedium: TextStyle(fontSize: 14, color: VColors.ink, height: 1.5),
      bodySmall: TextStyle(fontSize: 13, color: VColors.muted, height: 1.45),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: VColors.canvas, foregroundColor: VColors.ink,
      scrolledUnderElevation: 0, elevation: 0, centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: VColors.ink),
    ),
    cardTheme: CardThemeData(
      elevation: 0, margin: EdgeInsets.zero, color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22),
        side: const BorderSide(color: VColors.line)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true, fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      hintStyle: const TextStyle(fontSize: 12, color: VColors.muted),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: VColors.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: VColors.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: VColors.brand, width: 1.6)),
    ),
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(
      backgroundColor: VColors.brand, foregroundColor: Colors.white,
      minimumSize: const Size(0, 50), elevation: 0,
      textStyle: const TextStyle(fontWeight: FontWeight.w800),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
    )),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(
      foregroundColor: VColors.ink, side: const BorderSide(color: VColors.line),
      minimumSize: const Size(0, 46),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    )),
    chipTheme: ChipThemeData(
      backgroundColor: Colors.white, selectedColor: VColors.softBlue,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: VColors.line)),
      labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
    ),
    dividerTheme: const DividerThemeData(color: VColors.line, thickness: 1),
  );
}
