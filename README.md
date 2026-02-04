### ⭐The Card Table - An event organising platform for card games!⭐

<img width="882" height="678" alt="image" src="https://github.com/user-attachments/assets/615f8309-8a61-4397-b9e9-9ff33652a693" />

Hello and welcome to my project!

I am passionate about card games, specifically the Pokemon Trading Card game, and was tasked with a University project to create an online platform which uses databases and Express. So, I decided to make this!

This was one of my first pajor projects using a full database made with SQLite, and uses Express for routing with EJS files.

## What can users do on the platform?

This platform allows organises to create events, and for antendees to book tickets!

Organisers can make their own accounts and update their details when they want. They can also make draft events, publish events, and change ticket amounts and prices as and when they please!

Atendees do not need accounts and can sign up for tickets to any events they see! If an event interests you, just input how many tickets you want along with your name and email and you're done!

## Technical Features

The website has full validation for passwords, so your password actually has to be strong to meet requirements. I use bcrypt for this!

The website keeps track of user state, so you must be logged in to access certain pages.

Events are updated in real time, so on refresh you will obtain the most up to date data. When organisers delete events or update them, they will be visible right away on the site.

Events cannot be put in the past.

Attendees cannot make multiple ticket reservations with the same email.

Events must be selling at least one ticket!
