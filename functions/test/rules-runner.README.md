Firestore security rules cannot be validated by the pure Node tests. In a connected build environment:
1. Install Firebase CLI and @firebase/rules-unit-testing.
2. Run Firestore Emulator via firebase emulators:exec --only firestore.
3. Test that self-profile get succeeds, other-profile get fails, unauthenticated get fails,
   and every direct read/write of /orders, /companies, /companySecrets, /notices,
   /deliveryInbox, /auditEvents fails even when signed in as general manager.
4. Privileged access must only succeed via authorized callable functions.
Never deploy rules without an emulator test.
