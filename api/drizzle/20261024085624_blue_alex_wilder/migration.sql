CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "admin_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_admin_id_admins_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id");--> statement-breakpoint
WITH created AS (
	INSERT INTO "admins" ("name")
	SELECT 'BookLeaf Admin'
	WHERE EXISTS (
		SELECT 1 FROM "users"
		WHERE lower("email") = 'admin@bookleaf.dev' AND "admin_id" IS NULL
	)
	RETURNING "id"
)
UPDATE "users"
SET "admin_id" = (SELECT "id" FROM created)
WHERE lower("email") = 'admin@bookleaf.dev' AND "admin_id" IS NULL;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_author_check", ADD CONSTRAINT "users_role_author_check" CHECK ((
        ("role" = 'author' AND "author_id" IS NOT NULL AND "admin_id" IS NULL)
        OR ("role" = 'admin' AND "admin_id" IS NOT NULL AND "author_id" IS NULL)
      ));