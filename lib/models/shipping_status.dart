/// Velnix shipping business states, from the client brief and the twelve states
/// read from the Click Delivery portal (2026-10-18, owner's authorized session,
/// client code 1603). They are DISPLAY vocabulary only: the provider has never
/// published an API status code, so no numeric/carrier code is derived here.
/// They remain fully separate from [OrderStatus] and never imply a collected
/// amount.
enum ShippingStatus {
  awaitingPickup,
  carrierWarehouse,
  outForDelivery,
  delivered,
  partiallyDelivered,
  deferred,
  cancelled,
  returned,
  partiallyReturned,
  returnedWarehouse,
  inShippingToSender,
  clientReceivedReturn;

  static ShippingStatus? parse(Object? value) {
    for (final status in values) {
      if (status.name == value) return status;
    }
    return null;
  }

  /// True only for the exact labels that have been seen in a real Click API
  /// response. Everything else is documented by the portal but not yet
  /// API-verified, so it must not be presented as a proven fact.
  bool get isApiConfirmed => this == ShippingStatus.awaitingPickup;

  /// Returns/exception states never represent forward progress toward delivery.
  bool get isException => const {
    ShippingStatus.partiallyDelivered,
    ShippingStatus.deferred,
    ShippingStatus.cancelled,
    ShippingStatus.returned,
    ShippingStatus.partiallyReturned,
    ShippingStatus.returnedWarehouse,
    ShippingStatus.inShippingToSender,
    ShippingStatus.clientReceivedReturn,
  }.contains(this);

  bool get isReturn => const {
    ShippingStatus.returned,
    ShippingStatus.partiallyReturned,
    ShippingStatus.returnedWarehouse,
    ShippingStatus.inShippingToSender,
    ShippingStatus.clientReceivedReturn,
  }.contains(this);

  /// The four forward stages shown on the compact track, in display order.
  static const track = [
    ShippingStatus.awaitingPickup,
    ShippingStatus.carrierWarehouse,
    ShippingStatus.outForDelivery,
    ShippingStatus.delivered,
  ];

  String get label => switch (this) {
    ShippingStatus.awaitingPickup => 'قيد انتظار الموافقة',
    ShippingStatus.carrierWarehouse => 'في مخزن الشحن',
    ShippingStatus.outForDelivery => 'في الشحن',
    ShippingStatus.delivered => 'تم التسليم',
    ShippingStatus.partiallyDelivered => 'تسليم جزئي',
    ShippingStatus.deferred => 'مؤجل',
    ShippingStatus.cancelled => 'ملغي',
    ShippingStatus.returned => 'مرتجع',
    ShippingStatus.partiallyReturned => 'مرتجع جزئي',
    ShippingStatus.returnedWarehouse => 'في مخزن المرتجعات',
    ShippingStatus.inShippingToSender => 'في الشحن للراسل',
    ShippingStatus.clientReceivedReturn => 'تم استلام المرتجع',
  };
}
