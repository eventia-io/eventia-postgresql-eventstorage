
-- Event table
CREATE TABLE Events (
    Id                  UUID NOT NULL,
    Position            BIGSERIAL NOT NULL,
    LogDate             TIMESTAMPTZ NOT NULL DEFAULT now(),
    AggregateIdentifier UUID NOT NULL,
    SequenceNumber      INTEGER NOT NULL,
    AggregateType       TEXT NOT NULL,
    PayloadType         TEXT NOT NULL,
    Payload             JSONB,
    Metadata            JSONB,

    PRIMARY KEY (Id)
);

-- Indexes and constraints
CREATE UNIQUE INDEX Index_Events_Position
    ON Events (Position);
CREATE UNIQUE INDEX Index_Events_AggregateIdentifier_SequenceNumber
    ON Events (AggregateIdentifier, SequenceNumber);
CREATE INDEX Index_Events_PayloadType
    ON Events USING HASH (PayloadType);

-- Rules to make the event table an immutable and append-only storage
CREATE RULE Rule_Events_NoDelete AS
    ON DELETE TO Events DO INSTEAD NOTHING;
CREATE RULE Rule_Events_NoDpdate AS
    ON UPDATE TO Events DO INSTEAD NOTHING;
