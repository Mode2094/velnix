# قبول إعادة التصميم — النطاق والشاشات

## ما أُنجز على مستوى الكود (واجهة تجريبية فقط)

1. Dashboard: hero + role-aware quick indicators + delivery orders category and internal orders category.
2. Each category includes **all 9** statuses. Every mini-card computes its count and amount from the same role-visible records, and filters into the Orders screen. Total must equal status-count sum.
3. Orders: filter by bucket, status, overdue, text; cards with details; order details, edit/create, status history.
4. Delivery companies: global summary + per-company status cards with count, amount, and company-specific drill-down; admin-only view.
5. Settings: role-aware menu; employee cards, per-user permissions edit, API/mapping form preview, sync preview, reports, notifications, profile, audit.
6. Roles: generalManager all; manager based on selected permissions; warehouse all operational orders and status update, no financial overview; sales own + data-entry orders; dataEntry own only; all create orders.
7. No order deletion. Delivery company soft-archive keeps historical relations.

## التسليم النهائي مستقبلاً يحتاج

- مراجعة UI على محاكيات وأجهزة حقيقية، RTL/safe areas/keyboard/scaling والانتقال بين الصفحات.
- Firebase Auth + Firestore Security Rules + Cloud Functions + tenant isolation + audit immutable.
- Company-specific API adapter, secrets on server, idempotent status sync via webhook/polling (depends on company support), retry and conflict policy.
- Real integration, system tests, security checks, deployment architecture, and release builds for platforms explicitly agreed.

**حدود المشروع:** No merchant store, product catalog, inventory/warehouse stock subsystem, or app-store publishing in phase 1.
