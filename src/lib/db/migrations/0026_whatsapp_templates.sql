CREATE TABLE "whatsapp_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"logical_id" varchar(100) NOT NULL,
	"provider" varchar(10) NOT NULL,
	"content_sid" varchar(64),
	"template_name" varchar(512),
	"language" varchar(10) DEFAULT 'es' NOT NULL,
	"approval_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_templates_logical_provider_lang_idx" ON "whatsapp_templates" USING btree ("logical_id","provider","language");
