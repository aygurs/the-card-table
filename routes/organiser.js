const express = require("express");
const router = express.Router();

//WROTE WITHOUT ASSISTANCE START//
//Check if a user is logged in
//Stops non logged in users from going to organiser pages
function ensureLoggedIn(req, res, next)
{
    if (!req.session.organiser_id)
    {
        return res.redirect('/organiser/login');
    }

    next();
};

//Setup express validator
const {body, validationResult} = require('express-validator');

//Setup bcrypt for password hashing
const bcrypt = require("bcrypt");

//Setup Date-fns for date formatting
const {format, parseISO, isBefore, addDays, startOfDay} = require('date-fns');

/////CREATE ACCOUNT/////
/**
 * @desc Displays a page with a form for creating a new organiser account
 */
router.get("/create-account", (req, res) => {
    res.render("organiser-create-account.ejs", {valError: [], error: null, success: null, formData: {}});
});

/**
 * @desc Add a new organiser to the database based on data from the submitted form
 */
router.post("/create-account", 

    //Validate input for username and password
    [
        body("username")
            .trim()
            .notEmpty().withMessage("Username cannot be empty.")
            .matches(/^[a-zA-Z0-9_-]+$/).withMessage("Username can only contain letters, numbers, hyphens, and underscores.")
            .isLength({max: 15}).withMessage("Usernames can only be 15 characters long."),

        body("password")
            .trim()
            .notEmpty().withMessage("Password cannot be empty.")
            .isLength({min: 6}).withMessage("Password must be at least 6 characters.")
            .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter.")
            .matches(/[0-9]/).withMessage("Password must contain at least one number."),
    ],
    
    //Use async to wait for bcrypt
    async (req, res, next) => {

    //Check for errors
    const valErrors = validationResult(req);
    if (!valErrors.isEmpty())
    {
        //If any errors found, return array of errors
        return res.status(400).render('organiser-create-account.ejs', {valError: valErrors.array(), error: null, success: null, formData: req.body});
    };

    //Obtain user data
    const {username, password, eventName, eventDesc} = req.body;

    //Hash password using bcrypt doing 10 salt rounds
    const hashedPassword = await bcrypt.hash(password, 10);

    // Define the query
    const query = "INSERT INTO organisers (username, password, event_manager_name, event_manager_desc) VALUES(?, ?, ?, ?);"
    const query_parameters = [username, hashedPassword, eventName, eventDesc];
    
    // Execute the query and send a confirmation message
    global.db.run(query, query_parameters,
        function (err) 
        {
            //Handle
            if (err) 
            {
                //Username already exists
                if (err.message.includes("UNIQUE constraint failed")) 
                {
                    return res.status(400).render("organiser-create-account.ejs", {valError: [], error: "Username already exists.", success: null, formData: req.body});
                }
                //Empty input 
                else if (err.message.includes("NOT NULL constraint failed")) 
                {
                    return res.status(400).render("organiser-create-account.ejs", {valError: [], error: "All fields are required.", success: null, formData: req.body});
                } 
                else 
                {
                    return next(err); //For unexpected errors
                }
            }
            
            //Success
            res.render("organiser-create-account.ejs", {
                valError: [],
                error: null,
                success: "Account created successfully! You can now log in.",
                formData: {}
            });
        }
    );
});

/////LOGIN/////
/**
 * @desc Displays a page with a form for organisers to login
 */
router.get("/login", (req, res) => {
    res.render("organiser-login.ejs", {valError: [], error: null, formData: {}});
});

/**
 * @desc Logs an organiser into the organiser section of the website
 */
router.post('/login', 

    //Validate username and password input
    [
        body('username')
            .trim()
            .notEmpty()
            .withMessage('Username is required.'), //Error array [0]

        body('password')
            .trim()
            .notEmpty()
            .withMessage('Password is required.') //Error array [1]
    ],
    
    (req, res, next) => {

    //Check for errors
    const valErrors = validationResult(req);
    if (!valErrors.isEmpty())
    {
        //If any errors found, return array of errors
        return res.status(400).render('organiser-login.ejs', {valError: valErrors.array(), error: null, formData: {}});
    };

    //Obtain username and password entered
    const {username, password} = req.body;

    //See if login exists
    //Check only username as bcrypt will check password
    const query = `SELECT * FROM organisers WHERE username = ?`;
    db.get(query, [username], async (err, row) =>
    {
        //If errors occur, send to global error handler
        if (err) return next(err);

        //If a matching row is found
        if (row) 
        {
            //Compare entered password with hashed password
            const match = await bcrypt.compare(password, row.password);

            if(match)
            {
                //Store session data after logging in
                req.session.organiser_id = row.organiser_id;
                req.session.username = row.username;
                req.session.managerName = row.event_manager_name;
                req.session.managerDesc = row.event_manager_desc;

                //Redirect to organiser home
                return res.redirect('/organiser/home');
            }
        } 

        //No matches
        res.render('organiser-login.ejs', {valError: [], error: 'Error: Invalid username or password.', formData: req.body});

    });
});


/////HOME PAGE/////
/**
 * @desc Displays the organiser home page
 */
router.get("/home", ensureLoggedIn, (req, res, next) => {

    //Obtain the organiser ID from request (URL)
    const organiserId = req.session.organiser_id;

    //Obtain both published and drafted events from organiser
    const publishedQuery = `
    SELECT * FROM events 
    WHERE organiser_id = ? AND is_published = 1 
    ORDER BY date_of_event ASC`;

    const draftQuery = `
    SELECT * FROM events 
    WHERE organiser_id = ? AND is_published = 0 
    ORDER BY date_of_event ASC`;

    //Execute published events query
    global.db.all(publishedQuery, [organiserId], (err, publishedRows) => {

        //Check for database errors, hand to global handler
        if (err) return next(err);

        //Execute drafted events query
        global.db.all(draftQuery, [organiserId], (err, draftRows) => {

            //Check for database errors, hand to global handler
            if (err) return next(err);

            //Give fetched information to front end
            res.render("organiser-home.ejs", {
                username: req.session.username,
                publishedEvents: publishedRows,
                draftedEvents: draftRows
            });
        });
    });
});


/////EDIT EVENT/////
/**
 * @desc Displays a page with a form for editting the organisers events
 */
router.get("/event/:id/edit", ensureLoggedIn, (req, res, next) => {

    //Obtain event ID from request (URL)
    const eventId = req.params.id;

    //Finds events with same id that also belong to current logged in organiser
    const query = `SELECT * FROM events WHERE event_id = ? AND organiser_id = ?`;

    //Execute query
    global.db.get(query, [eventId, req.session.organiser_id], (err, row) => {

        //Give database errors to global handler
        if (err) return next(err);

        //If no event is found
        if (!row) return res.status(404).send("Event not found. Please go back and try again.");

        //Success
        res.render("organiser-event.ejs", {event: row, error: null});
    });
});

/**
 * @desc Allows an organiser to edit an event
 */
router.post("/event/:id/edit", ensureLoggedIn, (req, res, next) => {
    const eventId = req.params.id;

    const {
        name,
        description,
        location,
        date,
        adultPrice, adultQuantity,
        seniorPrice, seniorQuantity,
        childPrice, childQuantity,
        studentPrice, studentQuantity,
        disabledPrice, disabledQuantity,
        kidsFree,
        freeAge,
        action
    } = req.body;

    //Create event data object to parse
    const eventData = {
        event_id: eventId,
        event_name: name,
        event_description: description,
        event_location: location,
        date_of_event: date,
        kids_go_free: kidsFree === 'Y' ? 1 : 0,
        free_kids_age_limit: freeAge || '',
        adult_qty: adultQuantity,
        adult_price: adultPrice,
        senior_qty: seniorQuantity,
        senior_price: seniorPrice,
        child_qty: childQuantity,
        child_price: childPrice,
        student_qty: studentQuantity,
        student_price: studentPrice,
        disabled_qty: disabledQuantity,
        disabled_price: disabledPrice
    };

    //See if event is published or not
    const isPublished = action === 'publish' ? 1 : 0;

    //Check event date entered
    const eventDate = startOfDay(parseISO(date));

    //Calculate earliest date possible for event
    const earliestAllowedDate = startOfDay(addDays(new Date(), 1));

    //If organiser wants to publish event, date must be 1 day in advanced
    if (action === 'publish' && isBefore(eventDate, earliestAllowedDate)) {
        return res.render("organiser-event.ejs", {
            event: eventData,
            error: "Event date must be at least 1 day in the future."
        });
    }

    //Calculate total number of tickets organiser wants to set
    const totalTickets =
        parseInt(adultQuantity || 0) +
        parseInt(seniorQuantity || 0) +
        parseInt(childQuantity || 0) +
        parseInt(studentQuantity || 0) +
        parseInt(disabledQuantity || 0);

    //If organiser wants to publish event, at least 1 ticket must be available
    if (isPublished && totalTickets === 0) {
        return res.render("organiser-event.ejs", {
            event: eventData,
            error: "You must set at least one ticket quantity before publishing the event."
        });
    }

    //Query the event
    const selectQuery = `SELECT is_published, date_published FROM events WHERE event_id = ? AND organiser_id = ?`;
    global.db.get(selectQuery, [eventId, req.session.organiser_id], (err, existingEvent) => {

        //Hand database errors to global handler
        if (err) return next(err);

        //If no event exists, return an error
        if (!existingEvent) return res.status(404).send("Event not found. Please go back and try again.");

        //Prevent lowering ticket quantities if already published
        if (existingEvent.is_published) {
            const qtyQuery = `
                SELECT adult_sold, senior_sold, child_sold, student_sold, disabled_sold
                FROM events WHERE event_id = ? AND organiser_id = ?
            `;
            return global.db.get(qtyQuery, [eventId, req.session.organiser_id], (err, current) => {
                if (err) return next(err);

                const newQuantities = {
                    adult: parseInt(adultQuantity),
                    senior: parseInt(seniorQuantity),
                    child: parseInt(childQuantity),
                    student: parseInt(studentQuantity),
                    disabled: parseInt(disabledQuantity)
                };

                const ticketTypes = ['adult', 'senior', 'child', 'student', 'disabled'];

                //For each ticket, see how many have sold and do not allow organiser
                //to decrease below already sold tickets
                for (const type of ticketTypes) {
                    const sold = parseInt(current[`${type}_sold`]);
                    const newQty = newQuantities[type];

                    //Return error if user tries to
                    if (newQty < sold) {
                        return res.render("organiser-event.ejs", {
                            event: eventData,
                            error: `You cannot reduce ${type} tickets below the number already sold (${sold}).`
                        });
                    }
                }

                proceedWithUpdate();
            });
        } else {
            proceedWithUpdate();
        }

        //Define the update logic with a helper function
        function proceedWithUpdate() {

            //Get current date
            const now = format(new Date(), 'yyyy-MM-dd');

            //Update event date parameters
            let datePublished = existingEvent.date_published;
            let dateLastModified = now;
            if (action === 'publish' && !datePublished) {
                datePublished = now;
            }

            //Update other event columns
            const updateQuery = `
                UPDATE events SET
                    event_name = ?, event_description = ?, event_location = ?, date_of_event = ?,
                    kids_go_free = ?, free_kids_age_limit = ?,
                    is_published = ?, date_published = ?, date_last_modified = ?,
                    adult_qty = ?, adult_price = ?,
                    senior_qty = ?, senior_price = ?,
                    child_qty = ?, child_price = ?,
                    student_qty = ?, student_price = ?,
                    disabled_qty = ?, disabled_price = ?
                WHERE event_id = ? AND organiser_id = ?
            `;

            const updateParams = [
                name,
                description,
                location,
                date,
                kidsFree === 'Y' ? 1 : 0,
                freeAge || null,
                isPublished,
                datePublished,
                dateLastModified,
                adultQuantity, adultPrice,
                seniorQuantity, seniorPrice,
                childQuantity, childPrice,
                studentQuantity, studentPrice,
                disabledQuantity, disabledPrice,
                eventId,
                req.session.organiser_id
            ];

            global.db.run(updateQuery, updateParams, function (err) {
                if (err) return next(err);
                return res.redirect("/organiser/home");
            });
        }
    });
});


/////NEW EVENT/////
/**
 * @desc Displays a page with a form for creating new organiser events
 */
router.get("/event/new", ensureLoggedIn, (req, res) => {
    res.render("organiser-event.ejs", {event: null, error: null});
});

/**
 * @desc Creates a new organiser event
 */
router.post("/event/new", ensureLoggedIn, (req, res, next) => 
{
    //Obtain user input from ejs
    const {
        name,
        description,
        location,
        date,
        adultPrice, adultQuantity,
        seniorPrice, seniorQuantity,
        childPrice, childQuantity,
        studentPrice, studentQuantity,
        disabledPrice, disabledQuantity,
        kidsFree,
        freeAge,
        action //Draft or Publish
    } = req.body;

    //Create event data object to parse
    const eventData = {
        event_name: name,
        event_description: description,
        event_location: location,
        date_of_event: date,
        kids_go_free: kidsFree === 'Y' ? 1 : 0,
        free_kids_age_limit: freeAge || '',
        adult_qty: adultQuantity,
        adult_price: adultPrice,
        senior_qty: seniorQuantity,
        senior_price: seniorPrice,
        child_qty: childQuantity,
        child_price: childPrice,
        student_qty: studentQuantity,
        student_price: studentPrice,
        disabled_qty: disabledQuantity,
        disabled_price: disabledPrice
    };

    //See if event is published or not
    const isPublished = action === 'publish' ? 1 : 0;

    //Check event date entered
    const eventDate = startOfDay(parseISO(date));

    //Calculate earliest date possible for event
    const earliestAllowedDate = startOfDay(addDays(new Date(), 1));

    //If organiser wants to publish event, date must be 1 day in advanced
    if (action === 'publish' && isBefore(eventDate, earliestAllowedDate)) {
        return res.render("organiser-event.ejs", {
            event: eventData,
            error: "Event date must be at least 1 day in the future."
        });
    }

    //Calculate total number of tickets organiser wants to set
    const totalTickets =
        parseInt(adultQuantity || 0) +
        parseInt(seniorQuantity || 0) +
        parseInt(childQuantity || 0) +
        parseInt(studentQuantity || 0) +
        parseInt(disabledQuantity || 0);

    //If organiser wants to publish event, at least 1 ticket must be available
    if (isPublished && totalTickets === 0) {
        return res.render("organiser-event.ejs", {
            event: eventData,
            error: "You must set at least one ticket quantity before publishing the event."
        });
    }

    //Obtain organiser ID
    const organiserId = req.session.organiser_id;

    //Date as of now
    const now = format(new Date(), 'yyyy-MM-dd');

    //As its a new event, set date created to now
    const dateCreated = now;

    //If user publishes now as well, set date publushed to now
    const datePublished = isPublished ? now : null;
    //If not, set date last modified to now
    const dateLastModified = !isPublished ? now : null;

    //Get the event manager name
    const organiserQuery = `SELECT event_manager_name FROM organisers WHERE organiser_id = ?`;


    global.db.get(organiserQuery, [organiserId], (err, organiser) => {

        //Send database errors to global handler
        if (err) return next(err);

        //If organiser not found, show error
        if (!organiser) return res.status(400).send("Organiser not found. Please go back and try again.");

        const eventManagerName = organiser.event_manager_name;

        //Prepare to insert into database
        const insertEventQuery = `
            INSERT INTO events 
            (
                organiser_id, event_name, event_description, event_location,
                date_of_event, kids_go_free, free_kids_age_limit,
                is_published, date_published, date_created, date_last_modified,

                adult_qty, adult_price,
                senior_qty, senior_price,
                child_qty, child_price,
                student_qty, student_price,
                disabled_qty, disabled_price, event_manager_name
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        //Values to insert into database
        const eventParams = 
        [
            req.session.organiser_id,
            name,
            description,
            location,
            date,
            kidsFree === 'Y' ? 1 : 0,
            freeAge || null,
            isPublished,
            datePublished,
            dateCreated,
            dateLastModified,

            //Ticket values from the form
            adultQuantity, adultPrice,
            seniorQuantity, seniorPrice,
            childQuantity, childPrice,
            studentQuantity, studentPrice,
            disabledQuantity, disabledPrice,
            eventManagerName
        ];

        global.db.run(insertEventQuery, eventParams, function (err) {

            //Give errors to global handler
            if (err) return next(err);

            //Redirect to home if successful
            return res.redirect("/organiser/home");
        });
    });
});


/////DELETE EVENT/////
/**
 * @desc Allows an organiser to delete their event
 */
router.post("/event/:id/delete", ensureLoggedIn, (req, res, next) => {

    //Obtain event ID and organiser ID
    const eventId = req.params.id;
    const organiserId = req.session.organiser_id;

    //Find row in database that matches and prepare to delete
    const deleteQuery = `DELETE FROM events WHERE event_id = ? AND organiser_id = ?`;

    //Execute query
    global.db.run(deleteQuery, [eventId, organiserId], function (err) {

        //Send database errors to global handler
        if (err) return next(err);

        //Check how many rows were affected by the change
        //If no rows were affected, nothing changed
        if (this.changes === 0) {
            return res.status(404).send("Event not found or event is not yours! Please go back and try again.");
        }

        //Success, redirect to home page once completed
        return res.redirect("/organiser/home");
    });
});


/////EVENT INFO/////
/**
 * @desc Allows an organiser to view info about their event
 */
router.get("/event/:id/info", ensureLoggedIn, (req, res, next) => {
    const eventId = req.params.id;

    //Query event information from database
    const query = `
        SELECT e.*, o.event_manager_name
        FROM events e
        JOIN organisers o ON e.organiser_id = o.organiser_id
        WHERE e.event_id = ? AND e.organiser_id = ?
    `;

    global.db.get(query, [eventId, req.session.organiser_id], (err, event) => {

        //Hand database errors to global handler
        if (err) return next(err);

        //If event was not found, return error
        if (!event) return res.status(404).send("Event not found. Please go back and try again.");

        //Calculate tickets sold/left
        event.tickets = {
            Adult: {
                sold: event.adult_sold,
                left: event.adult_qty - event.adult_sold,
                price: event.adult_price
            },
            Senior: {
                sold: event.senior_sold,
                left: event.senior_qty - event.senior_sold,
                price: event.senior_price
            },
            Child: {
                sold: event.child_sold,
                left: event.child_qty - event.child_sold,
                price: event.child_price
            },
            Student: {
                sold: event.student_sold,
                left: event.student_qty - event.student_sold,
                price: event.student_price
            },
            Disabled: {
                sold: event.disabled_sold,
                left: event.disabled_qty - event.disabled_sold,
                price: event.disabled_price
            }
        };

        res.render("organiser-event-info.ejs", {event});
    });
});


/////SITE SETTINGS/////
/**
 * @desc Displays a page with a form for editting the organisers events
 */
router.get("/site-settings", ensureLoggedIn, (req, res) => {

    //Obtain data from database for this organiser
    const query = `SELECT event_manager_name, event_manager_desc FROM organisers WHERE organiser_id = ?`;

    //Execute query
    global.db.get(query, [req.session.organiser_id], (err, row) => {

        //Send database errors to global handler
        if (err) return next(err);

        //If no row was found, return an error
        if (!row) return res.status(404).send("Organiser not found. Please go back and try again.");

        //If organiser was found, return data
        res.render("organiser-site-settings.ejs", {
            managerName: row.event_manager_name,
            managerDesc: row.event_manager_desc,
            error: null
        });
    });
});

/**
 * @desc Allow organisers to change their event manager name and description
 */
router.post("/site-settings", ensureLoggedIn, (req, res, next) => {

    //Obtain name and description from req
    const {managerName, managerDesc} = req.body;

    //If either is not filled out, return an error
    if (!managerName || !managerDesc) {
        return res.render("organiser-site-settings.ejs", {
            managerName,
            managerDesc,
            error: "Fields cannot be blank."
        });
    }

    //Update the database with the new entries
    const updateQuery = `UPDATE organisers SET event_manager_name = ?, event_manager_desc = ? WHERE organiser_id = ?`;

    //Execute the query
    global.db.run(updateQuery, [managerName, managerDesc, req.session.organiser_id], function (err) {

        //Hand database errors to global handler
        if (err) return next(err);

        //Update global variables for session with new data
        req.session.managerName = managerName;
        req.session.managerDesc = managerDesc;

        //Successful, redirect home
        res.redirect("/organiser/home");
    });
});
//WROTE WITHOUT ASSISTANCE END//

// Export the router object so index.js can access it
module.exports = router;
