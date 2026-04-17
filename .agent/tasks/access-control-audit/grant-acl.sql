BEGIN;
UPDATE "User" SET "journalAccessMigrated" = true WHERE email = 'coldcook1@haccp.local';
DELETE FROM "UserJournalAccess" WHERE "userId" = (SELECT id FROM "User" WHERE email='coldcook1@haccp.local');
INSERT INTO "UserJournalAccess" (id, "userId", "templateCode", "canRead", "canWrite", "canFinalize", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u.id, code, true, true, false, now(), now()
FROM "User" u, (VALUES ('hygiene'), ('cleaning'), ('fryer_oil')) AS v(code)
WHERE u.email = 'coldcook1@haccp.local';
COMMIT;
SELECT u.email, u."journalAccessMigrated", count(a.*) AS acl_count
FROM "User" u
LEFT JOIN "UserJournalAccess" a ON a."userId" = u.id
WHERE u.email = 'coldcook1@haccp.local'
GROUP BY u.email, u."journalAccessMigrated";
SELECT "templateCode", "canRead", "canWrite", "canFinalize"
FROM "UserJournalAccess"
WHERE "userId" = (SELECT id FROM "User" WHERE email = 'coldcook1@haccp.local')
ORDER BY "templateCode";
