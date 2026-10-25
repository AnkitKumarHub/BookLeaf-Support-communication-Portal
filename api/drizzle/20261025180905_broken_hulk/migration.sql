ALTER TABLE "ai_runs" ADD COLUMN "flagged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "flagged_by" uuid;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_flagged_by_users_id_fkey" FOREIGN KEY ("flagged_by") REFERENCES "users"("id");