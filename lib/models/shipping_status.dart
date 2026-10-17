/// Velnix business states from the client brief, never Click API status codes.
/// They remain separate from OrderStatus and never imply a collected amount.
enum ShippingStatus {
  awaitingPickup,
  carrierWarehouse,
  outForDelivery,
  delivered,
  partiallyDelivered,
  deferred,
  cancelled;

  static ShippingStatus? parse(Object? value) {
    for (final status in values) {
      if (status.name == value) return status;
    }
    return null;
  }

  String get label => switch (this) {
    awaitingPickup => 'قيد انتظار الموافقة',
    carrierWarehouse => 'مخزن الشحن',
    outForDelivery => 'في الشحن',
    delivered => 'تم التسليم',
    partiallyDelivered => 'تسليم جزئي',
    deferred => 'مؤجل',
    cancelled => 'ملغي',
  };
}
