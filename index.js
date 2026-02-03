// Set up express, bodyparser and EJS
const express = require('express');
const app = express();
const port = 3000;
var bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs'); // set the app to use ejs for rendering
app.use(express.static(__dirname + '/public')); // set location of static files

// Set up SQLite
// Items in the global namespace are accessible through out the node application
const sqlite3 = require('sqlite3').verbose();
global.db = new sqlite3.Database('./database.db',function(err){
    if(err){
        console.error(err);
        process.exit(1); // can't connect to the DB
    } else {
        console.log("Database connected");
        global.db.run("PRAGMA foreign_keys=ON");
    }
});

//Setup sessions
const session = require('express-session');
app.use(session({
  secret: 'youllNeverGuess',
  resave: false,
  saveUninitialized: true
}));

//Set up variables to use across webpages
app.use((req, res, next) => {
    //Obtain user data once logged in
    res.locals.username = req.session.username || null;
    res.locals.managerName = req.session.managerName || null;
    res.locals.managerDesc = req.session.managerDesc || null;
    next();
});

//Handle requests to the home page 
app.get('/', (req, res) => {
    res.render('index')
});

//Add all the route handlers in organiserRoutes to the app under the path /organiser
const organiserRoutes = require('./routes/organiser');
app.use('/organiser', organiserRoutes);

//Add all the route handlers in attendeeRoutes to the app under the path /attendee
const attendeeRoutes = require('./routes/attendee');
app.use('/attendee', attendeeRoutes);

//WROTE WITHOUT ASSISTANCE START//
//Custom error handler (global)
app.use(function (err, req, res, next) {

    //Show error in terminal
    console.error(err.stack);

    if (err.message.includes("no such column")) {
        res.status(500).send("Internal Database error! One or more columns do not exist. Please go back and try again.");
    } else if (err.message.includes("UNIQUE constraint failed")) {
        res.status(400).send("Input error! You have tried to enter a value that already exists. Please go back and try again.");
    } else if (err.message.includes("NOT NULL constraint failed")) {
        res.status(400).send("Input error! You have entered a blank field. Please go back and try again.");
    } else {
        res.status(500).send("Oops! Something went wrong. Please go back and try again, or try again later.");
    }
});
//WROTE WITHOUT ASSISTANCE END//

// Make the web application listen for HTTP requests
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})

