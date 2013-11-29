// constats used by the application
var CONSUMER_KEY = ""; /// API key for your Twitter application
var CONSUMER_SECRET = ""; /// Secret for the API key
var LISTEN_PORT = 8080; /// change to 80 if you are not using reverse proxy
var LOAD_TWEETS_ASYNC = 5; /// Twitter API requests limit is 16 requests per 15 minutes
var LOAD_TWEETS_PER_PAGE = 20;
var RESULTS_TTL = 60 * 6; /// cache results for this time
var LISTEN_DOMAIN = "127.0.0.1"; /// domain used for Twitter callback

var express = require('express');
var app = express();
var passport = require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;
var MongoStore = require('connect-mongo')(express);
var MongoClient = require('mongodb').MongoClient;
var twitter = require('twitter');
var async = require('async');

var mongodb = null;
var timelines = null;

MongoClient.connect('mongodb://127.0.0.1:27017/twitgest', function(err, db) {
    if (err) throw err;
    mongodb = db;
    mongodb.collection('timelines', function(err, collection) {
        if (err) throw err;
        timelines = collection;
        timelines.ensureIndex({updated: 1}, {expireAfterSeconds: RESULTS_TTL}, function(err, result) {
            if (err) throw err;
        });
    });
});

passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

passport.use(new TwitterStrategy({
        consumerKey: CONSUMER_KEY,
        consumerSecret: CONSUMER_SECRET,
        callbackURL: "http://" + LISTEN_DOMAIN + ":" + LISTEN_PORT + "/auth/twitter/callback"
    },
    function(token, tokenSecret, profile, done) {
        profile.token = token;
        profile.tokenSecret = tokenSecret;
        process.nextTick(function () {
            return done(null, profile);
        });
    }
));

app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(passport.initialize());
app.use(express.cookieParser());
app.use(express.session({
    secret: 'FlyingHeroes64',
    store: new MongoStore({
        db: 'twitgest'
    })
}));
app.use(app.router);
app.use(express.static(__dirname + '/public'));

app.get('/auth/twitter',  passport.authenticate('twitter'));
app.get('/auth/twitter/callback', passport.authenticate('twitter', {
    failureRedirect: '/?fail'
}), function(req, res) {
    req.session.user = {
        id: req.user.id,
        displayName: req.user.displayName,
        avatar: req.user.photos[0].value,
        token: req.user.token,
        tokenSecret: req.user.tokenSecret
    };
    res.redirect('/');
});

app.get('/', function(req, res) {
    if (req.session.user) {
        res.redirect('/best');
    } else {
        res.render('main');
    }
});

app.get('/best', function(req, res) {
    if (req.session.user) {
        res.render('best', {
            screen_name: req.session.user.displayName,
            avatar: req.session.user.avatar,
        });
    } else {
        res.redirect('/');
    }
});

app.get('/login', function(req, res) {
    res.redirect('/auth/twitter');
});

app.get('/logout', function(req, res) {
    req.session.user = undefined;
    res.redirect('/');
});

function get_twitter_client(user) {
    return new twitter({
        consumer_key: CONSUMER_KEY,
        consumer_secret: CONSUMER_SECRET,
        access_token_key: user.token,
        access_token_secret: user.tokenSecret
    });
}

function extract_tweet_data(tweet) {
    return {
        text: tweet.text,
        created_at: new Date(tweet.created_at),
        retweet_count: tweet.retweet_count,
        favorite_count: tweet.favorite_count,
        id_str: tweet.id_str,
        user: {
            name: tweet.user.name,
            screen_name: tweet.user.screen_name,
            profile_image_url: tweet.user.profile_image_url
        }
    };
}

function load_nth_page(client) {
    return function(n, callback) {
        client.get('/statuses/home_timeline.json', 
            {
                include_rts: 1,
                count: LOAD_TWEETS_PER_PAGE,
                page: n + 1
            },
            function(data) {
                if (data instanceof Error) {
                    callback(data, null);
                    console.log(data);
                } else {
                    async.map(data, function(tweet, next) {
                        next(null, extract_tweet_data(tweet));
                    }, callback);
                }
            }
        );
    }
}

function load_home_timeline(user, timeline_callback) {
    var client = get_twitter_client(user);

    async.mapLimit(range(1, LOAD_TWEETS_ASYNC), LOAD_TWEETS_ASYNC, load_nth_page(client), function(err, results) {
        var result = [];
        for (i in results) {
            result.push.apply(result, results[i]);
        }
        timelines.insert({
            _id: user.id,
            updated: new Date(),
            timeline: result
        }, function(err, records) {
            timeline_callback(null, result);
        });
    });
}

function range(start, end) {
    var res = [];
    for (var i = start; i <= end; ++i) {
        res.push(i);
    }
    return res;
}

function get_home_timeline(user, timeline_callback) {
    timelines.findOne({ _id: user.id }, function(err, timeline) {
        if (timeline) {
            timeline_callback(null, timeline.timeline);
            return;
        } else {
            load_home_timeline(user, timeline_callback);
        }
    });
}

function check_auth(err, req, res, next) {
    if (req.session.user) {
        next(req, res);
    } else {
        res.send({
            success: 0,
            error: 'not authenticated'
        });
    }
}

function get_weight(tweet, date_first, date_last) {
    return 2 + tweet.retweet_count + tweet.favorite_count
}

app.use('/api/', check_auth);

app.get('/api/home_timeline', function(req, res) {
    get_home_timeline(req.session.user, function(err, timeline) {
        res.send({
            success: 1,
            result: timeline
        });
    });
});


app.get('/api/best', function(req, res) {
    var user = req.session.user;

    get_home_timeline(user, function(err, timeline) {
        var start_date = new Date();
        var users_tweets = {};

        var date_first = new Date();
        var date_last = new Date();
        var users_count = 0;
        for (var i in timeline) {
            if (timeline[i].created_at < date_first) {
                date_first = timeline[i].created_at;
            }
        }
        for (var i in timeline) {
            var tweet = timeline[i];
            var screen_name = tweet.user.screen_name;
            if (! (screen_name in users_tweets)) {
                users_tweets[screen_name] = { max_weight: 0, tweets: [] };
                users_count++;
            }
            users_tweets[screen_name].tweets.push(tweet);
            var weight = get_weight(tweet, date_first, date_last);
            if (users_tweets[screen_name].max_weight < weight) {
                users_tweets[screen_name].max_weight = weight;
            }
        }
        var res_timeline = [];
        var show_tweets = req.query.count;
        if (! show_tweets)
            show_tweets = 20;
        if (show_tweets / users_count < 2) {
            average_count = 2;
        } else {
            var average_count = show_tweets / users_count;
        }
        for (var i in users_tweets) {
            var user = users_tweets[i];
            for (var j in user.tweets) {
                var tweet = user.tweets[j];
                tweet.weight = get_weight(tweet, date_first, date_last) / user.max_weight;
            }
            user.tweets.sort(function(t1, t2) {
                return t2.weight - t1.weight;
            });
            for (var k = 0; k < Math.min(average_count, user.tweets.length); ++k) {
                res_timeline.push(user.tweets[k]);
            }
        }
        res_timeline.sort(function(t1, t2) {
            return t2.weight - t1.weight;
        });
        res_timeline = res_timeline.slice(0, show_tweets);
        res_timeline.sort(function(t1, t2) {
            return t2.created_at - t1.created_at;
        });
        res.send(res_timeline);
    });
});

app.listen(LISTEN_PORT);
