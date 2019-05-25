
-- event table
CREATE TABLE events (

    position BIGSERIAL NOT NULL,
    logdate TIMESTAMPTZ NOT NULL DEFAULT now(),
    tenantid UUID NOT NULL,
    userid UUID NOT NULL,
    streamid UUID NOT NULL,
    sequence INT NOT NULL,
    eventid TEXT NOT NULL,
    eventdata JSONB,
    eventmetadata JSONB,

    PRIMARY KEY (position)
);

CREATE UNIQUE INDEX events_unique_stream_id_sequence ON events (streamid, sequence);
CREATE INDEX events_by_tenant_id ON events USING HASH (tenantid);
CREATE INDEX events_by_user_id ON events USING HASH (userid);
CREATE INDEX events_by_event_id ON events USING HASH (eventid);

-- rules to make the event table an immutable and append-only storage
CREATE RULE rule_events_nodelete AS ON DELETE TO events DO INSTEAD NOTHING;
CREATE RULE rule_events_noupdate AS ON UPDATE TO events DO INSTEAD NOTHING;
