- Security rules v2 for Cloud Firestore (`infra/firebase/firestore.rules`) and the Realtime Database
  (`infra/firebase/database.rules.json`): deny by default, every field validated, owner-only
  sharing, visibility, location and ownership transfer (with an immutable transfer record),
  owner-bound stream ids, write-once complete minutes, a bounded live window, and anonymous access
  only to public station projections, public day summaries, and the public status node.
- Firestore composite indexes (`infra/firebase/firestore.indexes.json`) for the constrained queries.
- An emulator test matrix (Auth + Firestore + Realtime Database) with real identities — anonymous,
  stranger, viewer, editor, the agent's editor account, owner, admin, former owner after a
  transfer, and a removed editor — for every path and query, including negative tests.
