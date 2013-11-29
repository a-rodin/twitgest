function format_date(str) {
    var date = new Date(str);
    return date.getFullYear() + "-" + 
        ("0" + date.getMonth()).slice(-2) + "-" +
        ("0" + date.getDate()).slice(-2) + " " +
        ("0" + date.getHours()).slice(-2) + ":" +
        ("0" + date.getMinutes()).slice(-2) + ":" +
        ("0" + date.getSeconds()).slice(-2);
}

function format_tweet(tweet) {
    var html = tweet.find('.text').html();
    var url_pattern = /(https?:\/\/\S+)/g;
    html = html.replace(url_pattern,"<a href=\"$1\" target=\"_blank\">$1</a>");
    var hashtag_pattern = /(#\S+)/g;
    html = html.replace(hashtag_pattern, function(hashtag) {
        return '<a href="https://twitter.com/search?q=' + 
            encodeURIComponent(hashtag) + '&src=hash" target="_blank">' + hashtag + '</a>';
    });
    var user_pattern = /@([a-zA-Z0-9_]+)/g;
    html = html.replace(user_pattern, '<a href="https://twitter.com/$1" target="_blank">@$1</a>');
    tweet.find('.text').html(html);
}

$(function() {
    $.get('http://twitgest.com/api/best', function(data) {
        if (! data.error) {
            var tweets = $('.tweets');
            var tpl = $('.tpl').find('.tweet');
            tweets.html('');
            for (var i in data) {
                var tweet = tpl.clone();

                var tweet_url = 'https://twitter.com/' + data[i].user.screen_name + '/status/' + data[i].id_str;
                var user_url = 'https://twitter.com/' + data[i].user.screen_name;

                tweet.find('.name').text(data[i].user.name);
                tweet.find('.name').attr('href', user_url);
                tweet.find('.screen_name').text('@' + data[i].user.screen_name);
                tweet.find('.screen_name').attr('href', user_url);
                tweet.find('.created_at').text(format_date(data[i].created_at));
                tweet.find('.created_at').attr('href', tweet_url);
                tweet.find('.text').text(data[i].text);
                tweet.find('.avatar img').attr('src', data[i].user.profile_image_url);
                tweet.find('.avatar').attr('href', user_url);
                tweet.find('.full').attr('href', tweet_url);
                format_tweet(tweet);

                tweet.appendTo(tweets);
            }
        }
    });
    return;
    var tweets_view = $(".tweets");
    var tweet_template = $(".tweets").find(".tweet");
    console.log(tweet_template);
    for (i = 0; i < 10; ++i) {
        var tweet_view = tweet_template.clone();
        tweet_view.appendTo(tweets_view);
    }
});
