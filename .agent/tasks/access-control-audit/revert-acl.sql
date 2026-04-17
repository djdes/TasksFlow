BEGIN;
UPDATE "User" SET "journalAccessMigrated" = false WHERE email = 'coldcook1@haccp.local';
DELETE FROM "UserJournalAccess"
WHERE "userId" = (SELECT id FROM "User" WHERE email = 'coldcook1@haccp.local');
COMMIT;
SELECT u.email, u."journalAccessMigrated", count(a.*) AS acl_count
FROM "User" u
LEFT JOIN "UserJournalAccess" a ON a."userId" = u.id
WHERE u.email = 'coldcook1@haccp.local'
GROUP BY u.email, u."journalAccessMigrated";
