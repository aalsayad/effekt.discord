require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const sanityClient = require("./sanityClient"); // Import the client from sanityClient.js

const app = express();
const port = process.env.PORT || 3001;
const PASSWORD = process.env.DELETE_INVITE_PASSWORD;

let inviteCache = [];
let guild = null;
let channel = null;

const fetchAndUpdateInvites = async () => {
  if (!guild) {
    console.log("Guild not found");
    return;
  }

  try {
    const fetchedInvites = await guild.invites.fetch();
    const filteredInvites = fetchedInvites.filter(
      (invite) => invite.maxUses === 2
    );

    inviteCache = filteredInvites.map((invite) => ({
      inviteLink: invite.code,
      uses: invite.uses,
      createdTimestamp: invite.createdTimestamp,
      expiresTimestamp: invite.expiresTimestamp,
    }));
    console.log("Cached invites:", inviteCache);
  } catch (error) {
    console.error("Error fetching invites:", error);
  }
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
});

client.on("ready", async () => {
  console.log("Bot is ready");

  try {
    guild = await client.guilds.fetch(process.env.GUILD_ID);
    channel = guild ? await guild.channels.fetch(process.env.CHANNEL_ID) : null;

    await fetchAndUpdateInvites();

    console.log(`Fetched guild: ${guild.name}`);
    console.log(
      `Fetched channel: ${channel ? channel.name : "Channel not found"}`
    );
  } catch (error) {
    console.error("Error during bot initialization:", error);
  }
});

client.on("guildMemberAdd", async (member) => {
  console.log(`New member joined: ${member.user.tag}`);

  try {
    const currentInvites = await guild.invites.fetch();
    const usedInvite = currentInvites.find((invite) => invite.uses === 1);

    if (usedInvite) {
      console.log(
        `This user joined with a premium invite link: ${usedInvite.code}`
      );
      const role = await guild.roles.fetch(process.env.ROLE_ID);

      if (role) {
        await member.roles.add(role);
        console.log(`Assigned premium role to ${member.user.tag}`);

        await member.send(
          `Welcome to Effekt.community Premium Channel! We have detected that you joined with a premium link, and a premium role has been assigned to your account. Enjoy your premium benefits!`
        );
        console.log(`Sent welcome message to ${member.user.tag}`);

        await usedInvite.delete();
        console.log(`Deleted invite link: ${usedInvite.code}`);

        await fetchAndUpdateInvites();
      } else {
        console.log("Premium role not found");
      }
    } else {
      console.log("No invite link found with increased uses");
    }
  } catch (error) {
    console.error("Error processing new member:", error);
  }
});

app.use(bodyParser.json()); // To parse JSON bodies
app.use(cors()); // Enable CORS for all routes
app.use(express.json());

//This converts email to safebase64 string to act as unique ID for sanity collection of community members
function emailToSafeBase64(email) {
  return Buffer.from(email)
    .toString("base64")
    .replace(/\//g, "_")
    .replace(/\+/g, "-")
    .replace(/=+$/, ""); // Remove any padding characters (=)
}

app.post("/invite", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send("Email is required");
  }

  // Check if email exists in Sanity and create if it doesn't
  try {
    const newDoc = {
      _id: emailToSafeBase64(email), // Ensure unique ID
      _type: "communityMembers", // Document type as defined
      email: email,
      inviteLink: "", // Will be updated with the actual invite link later
      linkredeemed: false,
    };

    // Check if email exists in Sanity and create if it doesn't
    const createdDoc = await sanityClient.createIfNotExists(newDoc);
    console.log(
      "Document created/updated on Sanity with user's email:",
      createdDoc
    );
  } catch (error) {
    console.error("Error querying or creating document:", error);
    return res.status(500).send("Error handling email document on Sanity");
  }

  if (guild && channel) {
    try {
      const invite = await channel.createInvite({
        maxUses: 2,
        maxAge: 600,
        unique: true,
      });

      res.send(invite.url);
      await fetchAndUpdateInvites();
    } catch (error) {
      console.error("Error creating invite:", error);
      res.status(500).send("Error creating invite");
    }
  } else {
    res.status(404).send("Guild or channel not found");
  }
});

app.post("/delete-invites", async (req, res) => {
  const { password } = req.body;

  if (password === PASSWORD) {
    if (guild) {
      try {
        const invites = await guild.invites.fetch();
        await Promise.all(invites.map((invite) => invite.delete()));

        res.send("All invites deleted successfully.");
        console.log("All invites deleted successfully.");
      } catch (error) {
        console.error("Error deleting invites:", error);
        res.status(500).send("Error deleting invites");
      }
    } else {
      res.status(404).send("Guild not found");
    }
  } else {
    res.status(403).send("Invalid password");
  }
});

client.login(process.env.BOT_SECRET);

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
