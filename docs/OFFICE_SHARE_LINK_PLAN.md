# Reusable office share links

Implement as one playable change alongside sign-out confirmation.

- Owners, admins and maintainers can create a share link for their office. The link is reusable until its server-owned expiry or revocation.
- Recipients must sign in. Accepting a link grants ordinary membership only, preserves an existing member's higher role and does not bypass account suspension.
- Keep the existing single-use invitation flow and recipient restrictions unchanged.
- Show the generated URL with copy/manual-copy support, expiry and revocation controls. Never persist raw tokens in browser storage or logs.
- Sign-out requires explicit confirmation; cancellation preserves the session and failed logout remains retryable.

Verification: regression tests for multiple recipients, single-use compatibility, expiry/revocation, authorization and UI failure paths; registered package tests, full build and independent review. Browser checks depend on access through the local certificate warning.
