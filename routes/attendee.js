const express = require("express");
const router = express.Router();

//Setup express validator
const {body, validationResult} = require('express-validator');

//Helper function to calculate tickets left
function calculateTicketsLeft(event) {
    return {
        Adult: event.adult_qty - event.adult_sold,
        Senior: event.senior_qty - event.senior_sold,
        Child: event.child_qty - event.child_sold,
        Student: event.student_qty - event.student_sold,
        Disabled: event.disabled_qty - event.disabled_sold
    };
}


/**
 * @desc Displays attendee home page
 */
router.get("/home", (req, res, next) => {

    //Obtain all published events from event database with relavent information
    const query = `
        SELECT event_id, event_manager_name, event_name, event_description, event_location, date_published, date_of_event
        FROM events
        WHERE is_published = 1
        ORDER BY date_of_event ASC
    `;

    //Execute query
    global.db.all(query, [], (err, rows) => {

        //Hand all database errors to global handler
        if (err) return next(err);

        //Render home page and hand all data to events variable for front end
        res.render("attendee-home.ejs", {
            events: rows
        });
    });
});

/**
 * @desc Displays a page with event information
 */
router.get("/event/:id", (req, res, next) => {

    //Get event ID
    const eventId = req.params.id;

    //Obtain event from database
    const eventQuery = `
        SELECT * FROM events 
        WHERE event_id = ? AND is_published = 1
    `;

    //Execute query
    global.db.get(eventQuery, [eventId], (err, event) => {

        //Hand database errors to global handler
        if (err) return next(err);

        //If no event was found, return error
        if (!event) return res.status(404).send("Event not found. Please go back and try again.");

        //Calculate remaining tickets and store in object
        event.tickets_left = calculateTicketsLeft(event);

        //Render page
        res.render("attendee-event-page.ejs", {
            event,
            error: null,
            valError: [],
            success: null
        });
    });
});


/**
 * @desc Allows users to make a booking for an event
 */
router.post("/event/:id/book", 

    //Validate email and name
    [
        body('email')
            .isEmail().withMessage('Please enter a valid email address.')
            .normalizeEmail(),

        body('name')
            .trim()
            .notEmpty().withMessage('Name is required.')
            .isLength({max: 50}).withMessage('Name can be a maximum of 50 characters.')
    ],
    
    (req, res, next) => {

    //Obtain event ID
    const eventId = req.params.id;

    //Collect validation errors
    const valErrors = validationResult(req);

    //If there are errors during validation
    if (!valErrors.isEmpty()) {

        //Get the event to load the page
        const eventQuery = `SELECT * FROM events WHERE event_id = ? AND is_published = 1`;
        global.db.get(eventQuery, [eventId], (err, event) => {
            if (err || !event) return next(err || new Error("Event not found. Please go back and try again."));

            //Calculate tickets left (needed to render event page)
            event.tickets_left = calculateTicketsLeft(event);

            //Render page with errors
            return res.render("attendee-event-page.ejs", {
                event,
                error: null,
                valError: valErrors.array(),
                success: null
            });
        });

        return;
    };

    //Get variables from EJS
    const {name, email, adultQty, childQty, seniorQty, studentQty, disabledQty} = req.body;

    //Convert ticket selections into integers and default to 0 if empty
    const tickets = {
        Adult: parseInt(adultQty) || 0,
        Child: parseInt(childQty) || 0,
        Senior: parseInt(seniorQty) || 0,
        Student: parseInt(studentQty) || 0,
        Disabled: parseInt(disabledQty) || 0
    };

    //Get the event
    const eventQuery = `SELECT * FROM events WHERE event_id = ?`;

    //Execute query
    global.db.get(eventQuery, [eventId], (err, event) => {

        //Hand database error to global handler
        if (err) return next(err);

        //If event was not found, return error
        if (!event) return res.status(404).send("Event not found. Please go back and try again.");

            //Calculate sum of total tickets qty
            let totalTickets = 0;
            for (let type in tickets) {
                totalTickets += tickets[type];
            }

            //Calculate tickets left (needed to render event page)
            event.tickets_left = calculateTicketsLeft(event);

            //If no tickets were booked, return error
            if (totalTickets === 0) {
                return res.render("attendee-event-page.ejs", {
                    event,
                    error: "You must book at least one ticket.",
                    valError: [],
                    success: null
                });
            }

        //Calculate current remaining tickets
        const remaining = calculateTicketsLeft(event);

        //If tickets requested is larger than tickets left, throw error
        for (let type in tickets) {
            if (tickets[type] > remaining[type]) {
                return res.render("attendee-event-page.ejs", {
                    event,
                    error: `Not enough ${type} tickets left. Please choose a smaller quantity.`,
                    valError: [],
                    success: null
                });
            }
        }

        //Insert attendee or ignore this line if attendee already exists
        const insertAttendee = `INSERT OR IGNORE INTO attendees (name, email) VALUES (?, ?)`;

        //Execute query
        global.db.run(insertAttendee, [name, email], function (err) {

            //Hand database error to global handler
            if (err) return next(err);

            //Obtain attendee ID from email entered, if it exists
            global.db.get(`SELECT attendee_id FROM attendees WHERE email = ?`, [email], (err, attendee) => {

                //Hand database error to global handler, or throw error if attendee not found
                if (err || !attendee) return next(err || new Error("Could not find attendee"));

                //Prevent duplicate booking by checking attendee ID against event ID
                const checkBooking = `SELECT * FROM bookings WHERE attendee_id = ? AND event_id = ?`;
                global.db.get(checkBooking, [attendee.attendee_id, eventId], (err, existing) => {

                    //Hand database error to global handler
                    if (err) return next(err);

                    //If event exists
                    if (existing) {

                        //Calculate tickets left (needed to render event page)
                        event.tickets_left = calculateTicketsLeft(event);

                        return res.render("attendee-event-page.ejs", {
                            event,
                            error: "Another booking has been made using this email.",
                            valError: [],
                            success: null
                        });
                    }

                    //Update sold tickets in events database
                    const updateQuery = `
                        UPDATE events SET
                            adult_sold = adult_sold + ?,
                            child_sold = child_sold + ?,
                            senior_sold = senior_sold + ?,
                            student_sold = student_sold + ?,
                            disabled_sold = disabled_sold + ?
                        WHERE event_id = ?
                    `;

                    const updateParams = [
                        tickets.Adult, tickets.Child, tickets.Senior,
                        tickets.Student, tickets.Disabled, eventId
                    ];

                    //Execute query
                    global.db.run(updateQuery, updateParams, function (err) {

                        //Hand databse errors to global database
                        if (err) return next(err);

                        //Insert new booking row
                        const insertBooking = `
                            INSERT INTO bookings (
                                attendee_id, event_id,
                                adult_qty, child_qty, senior_qty, student_qty, disabled_qty
                            ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        `;
                        const bookingParams = [
                            attendee.attendee_id, eventId,
                            tickets.Adult, tickets.Child, tickets.Senior,
                            tickets.Student, tickets.Disabled
                        ];

                        global.db.run(insertBooking, bookingParams, function (err) {

                            //Hand database error to global handler
                            if (err) return next(err);

                            //Fetch updated event to reflect ticket changes
                            global.db.get(`SELECT * FROM events WHERE event_id = ?`, [eventId], (err, updatedEvent) => {

                                //Hand database error to global handler or catch any new errors
                                if (err || !updatedEvent) return next(err || new Error("Could not fetch updated event"));

                                //Recalculate updated tickets left
                                updatedEvent.tickets_left = calculateTicketsLeft(updatedEvent);

                                //Render with fresh ticket info
                                res.render("attendee-event-page.ejs", {
                                    event: updatedEvent,
                                    error: null,
                                    valError: [],
                                    success: "Your booking was successful!"
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// Export the router object so index.js can access it
module.exports = router;