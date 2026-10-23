CREATE TYPE "ai_run_state" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "ai_state" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "ai_task_type" AS ENUM('classify', 'draft');--> statement-breakpoint
CREATE TYPE "draft_state" AS ENUM('none', 'pending', 'suggested', 'failed');--> statement-breakpoint
CREATE TYPE "message_visibility" AS ENUM('public', 'internal');--> statement-breakpoint
CREATE TYPE "ticket_category" AS ENUM('royalty_payments', 'isbn_metadata', 'printing_quality', 'distribution_availability', 'production_status', 'general_inquiry');--> statement-breakpoint
CREATE TYPE "ticket_priority" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "ticket_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM('author', 'admin');--> statement-breakpoint
CREATE SEQUENCE "public"."ticket_public_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"ticket_id" uuid NOT NULL,
	"task_type" "ai_task_type" NOT NULL,
	"state" "ai_run_state" NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"job_version" integer NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"city" text,
	"joined_date" date
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_id" text NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"isbn" text,
	"genre" text,
	"publication_date" date,
	"status" text NOT NULL,
	"mrp" numeric(12,2),
	"royalty_per_copy" numeric(12,2),
	"total_copies_sold" integer DEFAULT 0 NOT NULL,
	"total_royalty_earned" numeric(12,2),
	"royalty_paid" numeric(12,2),
	"royalty_pending" numeric(12,2),
	"last_royalty_payout_date" date,
	"print_partner" text,
	"available_on" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"ticket_id" uuid NOT NULL,
	"imagekit_file_id" text NOT NULL,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"mime" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" bigserial PRIMARY KEY,
	"ticket_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"ticket_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"visibility" "message_visibility" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"public_id" text NOT NULL,
	"author_id" uuid NOT NULL,
	"book_id" uuid,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open'::"ticket_status" NOT NULL,
	"ai_category" "ticket_category",
	"category_override" "ticket_category",
	"ai_priority" "ticket_priority",
	"priority_override" "ticket_priority",
	"ai_confidence" numeric(5,4),
	"ai_rationale" text,
	"ai_state" "ai_state" DEFAULT 'pending'::"ai_state" NOT NULL,
	"ai_job_version" integer DEFAULT 1 NOT NULL,
	"assigned_admin_id" uuid,
	"draft_body" text,
	"draft_state" "draft_state" DEFAULT 'none'::"draft_state" NOT NULL,
	"draft_prompt_version" text,
	"draft_edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "users_role_author_check" CHECK ((
        ("role" = 'author' AND "author_id" IS NOT NULL)
        OR ("role" = 'admin' AND "author_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "authors_source_id_unique" ON "authors" ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "books_source_id_unique" ON "books" ("source_id");--> statement-breakpoint
CREATE INDEX "books_author_id_status_idx" ON "books" ("author_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "books_id_author_id_unique" ON "books" ("id","author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" ("token_hash");--> statement-breakpoint
CREATE INDEX "ticket_attachments_ticket_id_idx" ON "ticket_attachments" ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_id_created_at_idx" ON "ticket_messages" ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_public_id_unique" ON "tickets" ("public_id");--> statement-breakpoint
CREATE INDEX "tickets_author_id_updated_at_idx" ON "tickets" ("author_id","updated_at");--> statement-breakpoint
CREATE INDEX "tickets_status_created_at_idx" ON "tickets" ("status","created_at");--> statement-breakpoint
CREATE INDEX "tickets_assigned_admin_id_status_idx" ON "tickets" ("assigned_admin_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" (lower("email"));--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_ticket_id_tickets_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id");--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_author_id_authors_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_tickets_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id");--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id");--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_actor_user_id_users_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_tickets_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id");--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_user_id_users_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_author_id_authors_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_admin_id_users_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_book_author_fk" FOREIGN KEY ("book_id","author_id") REFERENCES "books"("id","author_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_author_id_authors_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id");