import 'package:flutter/material.dart';
import '../models/entities.dart';
import 'theme.dart';

class VLogo extends StatelessWidget {
  const VLogo({super.key, this.size = 44, this.withTitle = false});
  final double size;
  final bool withTitle;
  @override Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
    Container(width: size, height: size, decoration: BoxDecoration(
      gradient: const LinearGradient(colors: [Color(0xFF7686FF), VColors.brand, VColors.navy], begin: Alignment.topRight, end: Alignment.bottomLeft),
      borderRadius: BorderRadius.circular(size * .29),
      boxShadow: [BoxShadow(color: VColors.brand.withValues(alpha: .21), blurRadius: 18, offset: const Offset(0, 6))],
    ), child: Center(child: Text('V', style: TextStyle(fontSize: size * .54, fontWeight: FontWeight.w900, color: Colors.white)))),
    if (withTitle) ...[const SizedBox(width: 10), Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      const Text('Velnix', style: TextStyle(fontSize: 21, height: 1.05, fontWeight: FontWeight.w900, color: VColors.ink)),
      Text('SMART ORDER MANAGEMENT', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w800, color: VColors.muted, letterSpacing: .8)),
    ])],
  ]);
}

class VCard extends StatelessWidget {
  const VCard({super.key, required this.child, this.padding = const EdgeInsets.all(17), this.margin = EdgeInsets.zero});
  final Widget child;
  final EdgeInsets padding;
  final EdgeInsets margin;
  @override Widget build(BuildContext context) => Card(margin: margin, child: Padding(padding: padding, child: child));
}

class VPanel extends StatelessWidget {
  const VPanel({super.key, required this.child, this.padding = const EdgeInsets.all(18), this.color = Colors.white, this.borderColor = VColors.line});
  final Widget child;
  final EdgeInsets padding;
  final Color color, borderColor;
  @override Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(22),
      border: Border.all(color: borderColor), boxShadow: [BoxShadow(color: VColors.navy.withValues(alpha: .045), blurRadius: 22, offset: const Offset(0, 9))]),
    padding: padding, child: child,
  );
}

class VScreen extends StatelessWidget {
  const VScreen({super.key, required this.child, this.padding = const EdgeInsets.fromLTRB(17, 13, 17, 36), this.maxWidth = 1140});
  final Widget child;
  final EdgeInsets padding;
  final double maxWidth;
  @override Widget build(BuildContext context) => Center(child: ConstrainedBox(
    constraints: BoxConstraints(maxWidth: maxWidth), child: Padding(padding: padding, child: child),
  ));
}

/// Responsive input groups: stacked on narrow phones, two balanced columns
/// on tablet / desktop. No hard-coded phone-only widths.
class VFormFields extends StatelessWidget {
  const VFormFields({super.key, required this.children, this.gap = 14});
  final List<Widget> children;
  final double gap;
  @override Widget build(BuildContext context) => LayoutBuilder(builder: (context, c) {
    final cross = c.maxWidth >= 610 ? 2 : 1;
    final w = (c.maxWidth - gap * (cross - 1)) / cross;
    return Wrap(spacing: gap, runSpacing: gap,
      children: [for (final item in children) SizedBox(width: w, child: item)]);
  });
}

class VSection extends StatelessWidget {
  const VSection({super.key, required this.title, this.trailing});
  final String title;
  final Widget? trailing;
  @override Widget build(BuildContext context) => Padding(padding: const EdgeInsets.fromLTRB(0, 21, 0, 13), child: Row(children: [
    Container(width: 4, height: 19, decoration: BoxDecoration(color: VColors.brand, borderRadius: BorderRadius.circular(4))),
    const SizedBox(width: 9), Expanded(child: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: VColors.ink))),
    if (trailing != null) trailing!,
  ]));
}

class VPageTitle extends StatelessWidget {
  const VPageTitle({super.key, required this.title, this.subtitle, this.action});
  final String title;
  final String? subtitle;
  final Widget? action;
  @override Widget build(BuildContext context) => Padding(padding: const EdgeInsets.only(bottom: 17), child: Row(children: [
    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: VColors.ink)),
      if (subtitle != null) Padding(padding: const EdgeInsets.only(top: 5), child: Text(subtitle!, style: const TextStyle(color: VColors.muted, fontSize: 12))),
    ])), if (action != null) action!,
  ]));
}

class VStatusChip extends StatelessWidget {
  const VStatusChip({super.key, required this.status});
  final OrderStatus status;
  @override Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(color: status.color.withValues(alpha: .10), borderRadius: BorderRadius.circular(9)),
    child: Text(status.label, style: TextStyle(color: status.color, fontSize: 12, fontWeight: FontWeight.w800)),
  );
}

class VMetric extends StatelessWidget {
  const VMetric({super.key, required this.label, required this.value, required this.icon, this.accent = VColors.brand});
  final String label, value;
  final IconData icon;
  final Color accent;
  @override Widget build(BuildContext context) => VPanel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Container(width: 38, height: 38, decoration: BoxDecoration(color: accent.withValues(alpha: .10), borderRadius: BorderRadius.circular(12)),
      child: Icon(icon, color: accent, size: 20)),
    const SizedBox(height: 12), Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900, color: VColors.ink)),
    const SizedBox(height: 3), Text(label, maxLines: 2, style: const TextStyle(fontSize: 12, color: VColors.muted)),
  ]));
}

class VEmpty extends StatelessWidget {
  const VEmpty({super.key, required this.title, this.subtitle, this.icon = Icons.inbox_outlined});
  final String title;
  final String? subtitle;
  final IconData icon;
  @override Widget build(BuildContext context) => Padding(padding: const EdgeInsets.all(35), child: Column(mainAxisSize: MainAxisSize.min, children: [
    Container(width: 70, height: 70, decoration: const BoxDecoration(shape: BoxShape.circle, color: VColors.softBlue), child: Icon(icon, size: 33, color: VColors.brand)),
    const SizedBox(height: 15), Text(title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
    if (subtitle != null) ...[const SizedBox(height: 6), Text(subtitle!, textAlign: TextAlign.center, style: const TextStyle(color: VColors.muted))],
  ]));
}

class VField extends StatelessWidget {
  const VField({super.key, required this.label, required this.controller, this.hint, this.keyboardType, this.maxLines = 1, this.requiredField = false, this.onChanged});
  final String label;
  final TextEditingController controller;
  final String? hint;
  final TextInputType? keyboardType;
  final int maxLines;
  final bool requiredField;
  final ValueChanged<String>? onChanged;
  @override Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text('$label${requiredField ? ' *' : ''}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: VColors.ink)),
    const SizedBox(height: 7), TextFormField(controller: controller, keyboardType: keyboardType, maxLines: maxLines, onChanged: onChanged,
      decoration: InputDecoration(hintText: hint), validator: requiredField ? (v) => (v == null || v.trim().isEmpty) ? 'هذا الحقل مطلوب' : null : null),
  ]);
}

void vToast(BuildContext context, String message) {
  ScaffoldMessenger.of(context).hideCurrentSnackBar();
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message), behavior: SnackBarBehavior.floating));
}

/// Accept Arabic-Indic and Persian digits on Arabic keyboards.
String asciiDigits(String input) => input.replaceAllMapped(RegExp(r'[٠-٩۰-۹]'), (match) {
  final code = match.group(0)!.runes.first;
  if (code >= 0x0660 && code <= 0x0669) return String.fromCharCode(0x0030 + code - 0x0660);
  return String.fromCharCode(0x0030 + code - 0x06F0);
});

String formatDate(DateTime dt) => '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
String formatTime(DateTime dt) => '${(dt.hour % 12 == 0 ? 12 : dt.hour % 12).toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')} ${dt.hour < 12 ? 'ص' : 'م'}';
String jod(num n) => '${n.toStringAsFixed(n == n.roundToDouble() ? 0 : 2)} د.أ';

class VDemoBanner extends StatelessWidget {
  const VDemoBanner({super.key, this.compact = false});
  final bool compact;
  @override Widget build(BuildContext context) => Container(
    padding: EdgeInsets.symmetric(horizontal: 12, vertical: compact ? 7 : 10),
    decoration: BoxDecoration(color: const Color(0xFFFFF8EA), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFF8E9CB))),
    child: Row(children: [const Icon(Icons.info_outline_rounded, color: Color(0xFFAD812F), size: 16), const SizedBox(width: 8),
      Expanded(child: Text('معاينة واجهات ببيانات تجريبية • Firebase وAPI غير متصلين بعد',
        style: TextStyle(fontSize: compact ? 10 : 11, color: const Color(0xFF976C22))))]),
  );
}
