import 'package:flutter/material.dart';
import 'live_app.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

/// Placeholder for the future stores (متاجر) module.
///
/// Reachable only from the fourth dashboard card; deliberately has no sidebar
/// or bottom-navigation entry and no backend calls yet.
class LiveStores extends StatelessWidget {
  const LiveStores({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('المتاجر')),
    body: Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: LiveContent(
          child: VPanel(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 44),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 88,
                  height: 88,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: VColors.softBlue,
                  ),
                  child: const Icon(
                    Icons.storefront_outlined,
                    color: VColors.brand,
                    size: 44,
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'المتاجر',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 10),
                const Text(
                  'قريبًا...',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: VColors.muted,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
