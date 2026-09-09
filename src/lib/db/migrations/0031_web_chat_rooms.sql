-- Feature 016: Web chat country rooms.
-- Records how a web lead entered — 'web:room:Ecuador' | 'web:room:México' | null (the
-- generic /chat page, or any non-web channel). Set once at lead creation by the room
-- bootstrap handler; never re-scoped. No backfill (existing leads stay null = generic).
ALTER TABLE "leads" ADD COLUMN "acquisition_source" varchar(40);
