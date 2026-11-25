import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../core/theme.dart';
import 'gateway.dart';

/// Live-connection state shown to the user. It never presents stale data as
/// confirmed: a snapshot that came from the local cache is `offline` until the
/// server confirms it.
enum SyncConnection { live, refreshing, offline }

/// One reading of the server's `sync/global` revision document.
///
/// Counters only — the document holds no order, customer or credential data.
class SyncRevision {
  const SyncRevision({
    this.orders = 0,
    this.companies = 0,
    this.notices = 0,
    this.fromCache = false,
  });
  final int orders;
  final int companies;
  final int notices;

  /// True when Firestore served this snapshot from its offline cache, i.e. the
  /// server has not confirmed it yet.
  final bool fromCache;
}

/// Single-document real-time sync.
///
/// Firestore rules deny direct reads of the business data, so the app keeps ONE
/// listener on the tiny `sync/global` revision document. When the server bumps a
/// counter (a Firestore trigger fires on every relevant write) the matching
/// [ValueNotifier] increments and the visible screens re-read their own
/// authorized data in place. There is never more than one listener, no polling,
/// and no direct access to the protected collections.
class SyncService {
  SyncService._();
  static SyncService instance = SyncService._();

  /// Overridable in tests: when set, [start] subscribes to this instead of
  /// Firestore and never touches the network.
  Stream<SyncRevision> Function()? testSource;

  /// Bumped when the server reports a change in each area.
  final orders = ValueNotifier<int>(0);
  final companies = ValueNotifier<int>(0);
  final notices = ValueNotifier<int>(0);

  /// Bumped for any server change. Screens whose data spans several collections
  /// (the dashboard counters) listen to this single notifier.
  final any = ValueNotifier<int>(0);

  final connection = ValueNotifier<SyncConnection>(SyncConnection.live);

  StreamSubscription<SyncRevision>? _sub;
  SyncRevision _last = const SyncRevision();
  Timer? _settle;

  bool get isRunning => _sub != null;

  /// Starts the single listener. Idempotent: calling it twice never creates a
  /// second subscription. Safe to call from widget tests (no network when a test
  /// gateway or [testSource] is installed) and never throws.
  void start() {
    if (_sub != null) return;
    final source = testSource;
    if (source == null && VelnixGateway.instance.testCall != null) {
      // Widget / unit test without an injected source: stay inert.
      return;
    }
    try {
      final stream = source?.call() ?? _firestoreStream();
      _sub = stream.listen(
        _apply,
        onError: (Object _) => connection.value = SyncConnection.offline,
        cancelOnError: false,
      );
    } catch (_) {
      // Firestore unavailable (unsupported platform, no app): keep the app
      // usable and show the honest offline state.
      connection.value = SyncConnection.offline;
    }
  }

  /// Drops the subscription (e.g. on background / logout). Any buffered,
  /// still-relevant server change is re-read on the next [start].
  void stop() {
    _settle?.cancel();
    _settle = null;
    _sub?.cancel();
    _sub = null;
  }

  void pause() => stop();

  void resume() {
    if (connection.value == SyncConnection.offline) {
      connection.value = SyncConnection.live;
    }
    start();
  }

  bool _seeded = false;

  void _apply(SyncRevision rev) {
    if (rev.fromCache) {
      // Cache-only snapshot: the server has not confirmed it. Do not present it
      // as fresh, and do not drive a refresh from possibly stale counters.
      connection.value = SyncConnection.offline;
      return;
    }
    if (!_seeded) {
      // The first server snapshot is the baseline, not a change: it must not
      // trigger a refresh on startup.
      _seeded = true;
      _last = rev;
      connection.value = SyncConnection.live;
      return;
    }
    final prev = _last;
    _last = rev;
    final changed =
        rev.orders != prev.orders ||
        rev.companies != prev.companies ||
        rev.notices != prev.notices;
    if (!changed) {
      connection.value = SyncConnection.live;
      return;
    }
    // Bump only the areas that actually changed so an unrelated screen is never
    // asked to re-read.
    if (rev.orders != prev.orders) orders.value++;
    if (rev.companies != prev.companies) companies.value++;
    if (rev.notices != prev.notices) notices.value++;
    any.value++;
    connection.value = SyncConnection.refreshing;
    // Settle to «محدّث» shortly after the sections have re-read.
    _settle?.cancel();
    _settle = Timer(const Duration(milliseconds: 1200), () {
      if (connection.value == SyncConnection.refreshing) {
        connection.value = SyncConnection.live;
      }
    });
  }

  Stream<SyncRevision> _firestoreStream() {
    return FirebaseFirestore.instance
        .doc('sync/global')
        .snapshots(includeMetadataChanges: true)
        .map((snap) {
          final d = snap.data() ?? const <String, dynamic>{};
          int i(String k) => (d[k] as num?)?.toInt() ?? 0;
          return SyncRevision(
            orders: i('orders'),
            companies: i('companies'),
            notices: i('notices'),
            fromCache: snap.metadata.isFromCache,
          );
        });
  }

  @visibleForTesting
  void reset() {
    stop();
    _seeded = false;
    _last = const SyncRevision();
    orders.value = 0;
    companies.value = 0;
    notices.value = 0;
    any.value = 0;
    connection.value = SyncConnection.live;
    testSource = null;
  }
}

/// A small, always-visible pill that tells the truth about freshness:
/// «محدّث» (server-confirmed), «جارٍ التحديث» (a change is being applied), or
/// «لا يوجد اتصال — ستتم المزامنة عند عودته».
class SyncIndicator extends StatelessWidget {
  const SyncIndicator({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<SyncConnection>(
      valueListenable: SyncService.instance.connection,
      builder: (context, state, _) {
        final (label, color, icon) = switch (state) {
          SyncConnection.live => (
            'محدّث',
            VColors.aqua,
            Icons.cloud_done_outlined,
          ),
          SyncConnection.refreshing => (
            'جارٍ التحديث',
            VColors.brand,
            Icons.cloud_sync_outlined,
          ),
          SyncConnection.offline => (
            'لا يوجد اتصال — ستتم المزامنة عند عودته',
            VColors.muted,
            Icons.cloud_off_outlined,
          ),
        };
        return Tooltip(
          message: label,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 230),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 15, color: color),
                const SizedBox(width: 5),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: color,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
