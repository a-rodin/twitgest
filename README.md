twitgest
========

It is a node.js application that allows you to see interesting tweets from your subscriptions.

Before running it you have to create an application at your twitter page, create consumer key and consumer secret, and set `CONSUMER_KEY` and `CONSUMER_SECRET` constants at `twitgest.js`. Also node > 0.10 and mongodb > 2.3 should be installed on your machine. Then you could execute the application by running

    git clone https://github.com/a-rodin/twitgest
    cd twitgest
    npm install
    npm start

Now you can open http://127.0.0.1:8080/ and see the most interesting tweets from your home timeline.
