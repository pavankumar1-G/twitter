// Import Third-party packages:

const express = require("express");
const app = express();
app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Initializing DB connection and Server:

let dbConnection = null;
const initializingDatabaseAndServer = async () => {
  try {
    dbConnection = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializingDatabaseAndServer();

// Write NetWork API calls for retrieving data from database with DB connection:

//API-1:
// Register with user details and create user in user table using API network call With POST method:

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const encryptedPassword = await bcrypt.hash(password, 10);
  const selectUserWithSqlQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = "${username}";
    `;
  const user = await dbConnection.get(selectUserWithSqlQuery);
  if (user === undefined) {
    //create user details in user table:
    const createUserDetailsWithSqlQuery = `
        INSERT INTO user(username, password, name, gender)
        VALUES(
            "${username}",
            "${encryptedPassword}",
            "${name}",
            "${gender}"
        );
        `;
    if (password.length < 6) {
      //send like password is too short:
      //Scenario-2:
      response.status(400);
      response.send("Password is too short");
    } else {
      //send like User created successfully
      //Scenario-3:
      await dbConnection.get(createUserDetailsWithSqlQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    //send like user already exists:
    //Scenario-1:
    response.status(400);
    response.send("User already exists");
  }
});

//API-2:
//user login with credentials by using API network call with POST method:

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserWithSqlQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = "${username}";
    `;
  const user = await dbConnection.get(selectUserWithSqlQuery);
  if (user === undefined) {
    //if an unregistered user tries to login:
    //Scenario-1:
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, user.password);
    if (isPasswordMatched === true) {
      //Scenario-3:
      //return JWT token if user successfully login:

      const jwtToken = jwt.sign(user, "08-12-2023pa1");
      response.send({ jwtToken });
    } else {
      //send like Invalid password:
      //Scenario-2:
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//write Authentication code with JWT token and middleware function:

const authenticationToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authorHeader = request.headers["authorization"];
  if (authorHeader !== undefined) {
    jwtToken = authorHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    // send like Invalid Jwt token:
    //Scenario-1:
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "08-12-2023pa1", async (error, payload) => {
      if (error) {
        // send like Invalid Jwt token:
        //Scenario-1:
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        //if it has successfully verified proceed to next middleware or handler function:
        request.tweetId = tweetId;
        request.tweet = tweet;
        request.payload = payload;
        console.log(payload);
        next();
      }
    });
  }
};

//API-3:
// get latest tweets of people with writing API and GET method:

const getPeoplesIdsOfUser = async (username) => {
  const getFollowingPeoplesQuery = `
    SELECT following_user_id 
    FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE user.username = "${username}";
    `;
  const followingPeople = await dbConnection.all(getFollowingPeoplesQuery);

  const peopleIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );

  return peopleIds;
};

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    let { payload } = request;
    const { user_id, name, username, gender } = payload;
    const peoplesIdsOfUser = await getPeoplesIdsOfUser(username);
    const getTweetsWithSqlQuery = `
    SELECT 
    username, tweet, date_time as dateTime
    FROM
    user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE
    user.user_id IN (${peoplesIdsOfUser})
    ORDER BY date_time DESC
    LIMIT 4;
    `;
    const latestTweets = await dbConnection.all(getTweetsWithSqlQuery);
    response.send(latestTweets);
  }
);

//API-4:
// get list of all names of people whom the user follows:

app.get("/user/following/", authenticationToken, async (request, response) => {
  let { payload } = request;
  const { user_id, name, username, gender } = payload;
  //console.log({ user_id, name, username, gender });

  const getListNamesWithSqlQuery = `
  SELECT
  name
  FROM 
  user INNER JOIN follower ON user.user_id = follower.following_user_id
  WHERE
  follower.follower_user_id = ${user_id};
  `;
  const listOfNamesOfUsers = await dbConnection.all(getListNamesWithSqlQuery);
  response.send(listOfNamesOfUsers);
});

//API-5:

//get list of all names of people who follows the user:

app.get("/user/followers/", authenticationToken, async (request, response) => {
  let { payload } = request;
  const { user_id, name, username, gender } = payload;
  //Get user id based on username:
  const getUserIdWithSqlQuery = `
    SELECT user_id FROM user WHERE username = "${username}";
    `;
  const userId = await dbConnection.get(getUserIdWithSqlQuery);
  //Get followers ids of user:
  const followerIdsWithSqlQuery = `
    SELECT follower_user_id FROM follower WHERE following_user_id = ${userId.user_id};
    `;
  const followerIdsList = await dbConnection.all(followerIdsWithSqlQuery);
  const followerIds = followerIdsList.map((eachUser) => {
    return eachUser.follower_user_id;
  });

  //Get followers names by using follower ids:
  const getFollowerNamesWithSqlQuery = `
    SELECT name FROM user WHERE user_id IN (${followerIds});
    `;
  const followerNames = await dbConnection.all(getFollowerNamesWithSqlQuery);
  response.send(followerNames);
});

//API-6:
//get tweets data from user following persons using API network call with Get method:

app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { tweetId } = request;
  let { payload } = request;
  const { user_id, name, username, gender } = payload;
  // get userId based on username by writing sql query:
  const getUserIdWithSqlQuery = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
  const userId = await dbConnection.get(getUserIdWithSqlQuery);

  //get ids of whom the user is following:
  const getFollowingIdsWithSqlQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id};
    `;
  const followingIdsList = await dbConnection.all(getFollowingIdsWithSqlQuery);
  const followingIds = followingIdsList.map((eachPerson) => {
    return eachPerson.following_user_id;
  });

  // get each person tweet ids :
  const getTweetIdsWithSqlQuery = `
SELECT tweet_id FROM tweet WHERE user_id IN (${followingIds});
`;
  const tweetsIdsList = await dbConnection.all(getTweetIdsWithSqlQuery);
  const tweetsIds = tweetsIdsList.map((eachTweetedPerson) => {
    return eachTweetedPerson.tweet_id;
  });

  // get tweets made by the users who he is following:

  const responseOutput = (tweet_tweetDate, countLikes, countReplies) => {
    return {
      tweet: tweet_tweetDate.tweet,
      likes: countLikes.likes,
      replies: countReplies.replies,
      dateTime: tweet_tweetDate.date_time,
    };
  };

  if (tweetsIds.includes(parseInt(tweetId))) {
    //get likes count:
    const getCountOfLikesWithSqlQuery = `
      SELECT count(user_id) as likes FROM like WHERE tweet_id = ${tweetId};
      `;
    const countLikes = await dbConnection.get(getCountOfLikesWithSqlQuery);

    //get replies count:
    const getRepliesCountWithSqlQuery = `
      SELECT count(user_id) as replies FROM reply WHERE tweet_id = ${tweetId};
      `;
    const countReplies = await dbConnection.get(getRepliesCountWithSqlQuery);

    //get tweet and tweet_date from tweet table:

    const getTweetAndTweetDateWithSqlQuery = `
    SELECT tweet, date_time FROM tweet WHERE tweet_id = ${tweetId};
    `;
    const tweet_tweetDate = await dbConnection.get(
      getTweetAndTweetDateWithSqlQuery
    );
    response.send(responseOutput(tweet_tweetDate, countLikes, countReplies));
  } else {
    // if user requests a tweet other than the users he is following: send as like Invalid request
    response.status(401);
    response.send("Invalid Request");
  }
});

//API-7:
// get list of usernames who liked the tweet if user requests a tweet of user he is following:

const convertDBObjectToResponseObject = (likedUserNames) => {
  return {
    likes: likedUserNames,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    // get tweet id and username by destructuring the request:
    const { tweetId } = request;
    let { payload } = request;
    const { user_id, name, username, gender } = payload;

    // get user id based on username  by writing SqlQuery:
    const getUserIdWithSqlQuery = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
    const userId = await dbConnection.get(getUserIdWithSqlQuery);

    // get following Ids whom the user follows:
    const getFollowingIdsWithSqlQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id};
    `;
    const followingIdsList = await dbConnection.all(
      getFollowingIdsWithSqlQuery
    );
    const followingIds = followingIdsList.map((eachOne) => {
      return eachOne.following_user_id;
    });

    // get tweetIds of user:
    const getTweetIdsWithSqlQuery = `
    SELECT tweet_id FROM tweet WHERE user_id IN (${followingIds});
    `;
    const tweetIdList = await dbConnection.all(getTweetIdsWithSqlQuery);
    const tweetIds = tweetIdList.map((eachOne) => {
      return eachOne.tweet_id;
    });

    //check is the tweet made by his followers using tweetId:
    if (tweetIds.includes(parseInt(tweetId))) {
      const getLikedUserNamesWithSqlQuery = `
        SELECT user.username as likes FROM user INNER JOIN like ON user.user_id = like.user_id WHERE like.tweet_id = ${tweetId};
        `;
      const likedUserNamesList = await dbConnection.all(
        getLikedUserNamesWithSqlQuery
      );
      const likedUserNames = likedUserNamesList.map((eachOne) => {
        return eachOne.likes;
      });
      response.send(convertDBObjectToResponseObject(likedUserNames));
    } else {
      //if user requests a tweet other than the users he is following:send like invalid request

      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-8:
// get names and  replies of whom the user following:
const convertDbObjectToResponseObject = (userNameAndReply) => {
  return {
    replies: userNameAndReply,
  };
};
app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  async (request, response) => {
    // get userId and username by destructuring ;
    const { tweetId } = request;
    let { payload } = request;
    const { user_id, name, username, gender } = payload;

    // get UserId based on username by writing SqlQuery:
    const getUserIdWithSqlQuery = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
    const userId = await dbConnection.get(getUserIdWithSqlQuery);

    // get followingIds of whom the user is following:
    const getFollowingIdsWithSqlQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id};
    `;
    const followingUserIdsList = await dbConnection.all(
      getFollowingIdsWithSqlQuery
    );
    const followingUserIds = followingUserIdsList.map((eachOne) => {
      return eachOne.following_user_id;
    });

    // get Each one tweet Ids based on following_user_id:
    const getTweetIdsWithSqlQuery = `
    SELECT tweet_id FROM tweet WHERE user_id IN (${followingUserIds});
    `;
    const tweetIdList = await dbConnection.all(getTweetIdsWithSqlQuery);
    const tweetIds = tweetIdList.map((eachOne) => {
      return eachOne.tweet_id;
    });

    //check is the tweet made by  the person he is following using tweetId:

    if (tweetIds.includes(parseInt(tweetId))) {
      const getUserNameReplyWithSqlQuery = `
        SELECT user.name, reply.reply FROM user INNER JOIN reply ON user.user_id = reply.user_id WHERE reply.tweet_id = ${tweetId};
        `;
      const userNameAndReply = await dbConnection.all(
        getUserNameReplyWithSqlQuery
      );
      response.send(convertDbObjectToResponseObject(userNameAndReply));
    } else {
      //if user requests a tweet other than the users he is following:send like invalid request

      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-9:
//get a list of all tweets of the user:
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  const getUserIdWithSqlQuery = `
  SELECT user_id FROM user WHERE username = '${username}';
  `;
  const userId = await dbConnection.get(getUserIdWithSqlQuery);
  console.log(userId);
  const getListOfTweetWithSqlQuery = `
    SELECT
    tweet.tweet AS tweet,
    COUNT(DISTINCT(like.like_id)) AS likes,
    COUNT(DISTINCT(reply.reply_id)) AS replies,
    tweet.date_time AS dateTime
    FROM
    user INNER JOIN tweet ON user.user_id = tweet.user_id 
    INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    WHERE user.user_id = ${user_id}
    GROUP BY tweet.tweet_id;
    `;
  const tweets = await dbConnection.all(getListOfTweetWithSqlQuery);
  response.send(tweets);
});

//API-10:
//Create a tweet in the tweet table:

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { tweetId } = request;
  const { tweet } = request;
  const { payload } = request;
  const { user_id, username, name, gender } = payload;

  const createTweetWithSqlQuery = `
  INSERT INTO tweet(tweet, user_id)
  VALUES(
      '${tweet}',
      ${user_id}
  );
  `;
  await dbConnection.run(createTweetWithSqlQuery);
  response.send("Created a Tweet");
});

//API-11:
//delete a tweet requested by user whom the user following:

app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, username, name, gender } = payload;

    const tweetUserWithSqlQuery = `
  SELECT * FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};
  `;
    const tweetUser = await dbConnection.all(tweetUserWithSqlQuery);

    if (tweetUser.length !== 0) {
      const deleteTweetWithSqlQuery = `
        DELETE FROM tweet WHERE 
        tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};
        `;
      await dbConnection.run(deleteTweetWithSqlQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Exporting express Instance:

module.exports = app;
