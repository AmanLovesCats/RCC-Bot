# Repuls-RCC-Bot
Current features: 

- 24 hours CCU stats post
- Today's top leaderboard players post
- Today's top clans post
- Commands for users include: server finder, user lookup(leaderboards), leaderboard(shows a specific leaderboard), sierra and help
- Commands for admins: global chat message count(for both a specific user search and top 10, in case we ever feel like knowing), manually update clans leaderboard for admins(failsafe), view the clans leaderboard(admins can view it anytime they want, the leaderboard updates every 45 minutes)

The biggest main feature will include an Esports database, which eldest has been informed about. This will allow players to see their esports statistics, tournament statistics and a lot more. It will only be worked on after the initial release.

The bot already has a way to create custom matches except that it cannot change the match settings YET, once that is made possible users can create custom matches directly from discord and a 1v1 system may be placed if docski allows it.

Further it's going to help admins a lot soon, it will be able to detect swears sent in the chat and notify them on discord about it, this will make moderation for them easier, integrating this may not take much time but making the system such that it doesn't have errors or do mistakes is the biggest part, which may again take time. 

A player search is also ready in the backend(not included here) but it is not possible to use since it can't fetch user stats of others(only of those whose playfabID and sessionticket it has, they may be considered sensitive data) therefore a different way has to be found to establish it, like a GET API for readonlydata/playerdata from the same playerdatabase that is used for logging in(LoginWithCustomID)
