-- Safe built-in avatar preset shared by account and public human-ranked profiles.
ALTER TABLE human_rank_players ADD COLUMN avatar TEXT NOT NULL DEFAULT 'person' CHECK(avatar IN ('person','spade','diamond','club','heart','star','moon','bolt'));
