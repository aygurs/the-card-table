
-- This makes sure that foreign_key constraints are observed and that errors will be thrown for violations
PRAGMA foreign_keys=ON;

BEGIN TRANSACTION;

--Organisers database
CREATE TABLE IF NOT EXISTS organisers (
    organiser_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE CHECK(username NOT LIKE '% %'),
    password TEXT NOT NULL,
    event_manager_name TEXT NOT NULL,
    event_manager_desc TEXT NOT NULL
);

--Events database
CREATE TABLE IF NOT EXISTS events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    organiser_id  INTEGER, --Which organiser event belongs to
    event_manager_name TEXT NOT NULL,
    event_name TEXT NOT NULL UNIQUE,
    event_description TEXT NOT NULL,
    event_location TEXT NOT NULL,
    date_created TEXT,
    date_last_modified TEXT,
    date_published TEXT,
    date_of_event TEXT NOT NULL,
    kids_go_free BOOLEAN NOT NULL DEFAULT 0, --Organiser decides if kids go free
    free_kids_age_limit INTEGER DEFAULT NULL, --Organiser decides age of kids that go free
    is_published BOOLEAN NOT NULL DEFAULT 0, --0 is draft, 1 is published

    --Tickets
    adult_qty INTEGER,
    adult_price REAL,
    adult_sold INTEGER DEFAULT 0,
    senior_qty INTEGER,
    senior_price REAL,
    senior_sold INTEGER DEFAULT 0,
    child_qty INTEGER,
    child_price REAL,
    child_sold INTEGER DEFAULT 0,
    student_qty INTEGER,
    student_price REAL,
    student_sold INTEGER DEFAULT 0,
    disabled_qty INTEGER,
    disabled_price REAL,
    disabled_sold INTEGER DEFAULT 0,


    FOREIGN KEY (organiser_id) REFERENCES organisers(organiser_id) ON DELETE CASCADE --If organiser is deleted, delete event
);

--Attendee database
CREATE TABLE IF NOT EXISTS attendees (
    attendee_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

--Bookings database
--A new booking row will appear for each user depending on ticket types booked
CREATE TABLE IF NOT EXISTS bookings (
    booking_id INTEGER PRIMARY KEY AUTOINCREMENT,
    attendee_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    adult_qty INTEGER DEFAULT 0,
    child_qty INTEGER DEFAULT 0,
    senior_qty INTEGER DEFAULT 0,
    student_qty INTEGER DEFAULT 0,
    disabled_qty INTEGER DEFAULT 0,
    FOREIGN KEY (attendee_id) REFERENCES attendees(attendee_id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
);

COMMIT;

