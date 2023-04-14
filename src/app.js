import dotenv from "dotenv";
import express, { json } from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { stripHtml } from "string-strip-html";
import dayjs from "dayjs";

import participantSchema from "./schemas/participant.js";
import messageSchema from "./schemas/message.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
const db = client.db();
const participants = db.collection("participants");
const messages = db.collection("messages");

const SESSION_TIMEOUT = 10_000;
const CHECK_INTERVAL = 15_000;

async function removeInactiveParticipants() {
  const now = Date.now();
  const leastAllowedTimestamp = now - SESSION_TIMEOUT;
  const query = { lastStatus: { $lt: leastAllowedTimestamp } };

  try {
    await participants.find(query).forEach(({ name }) => {
      messages.insertOne({
        from: name,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: dayjs(now).format("HH:mm:ss"),
      });
    });
    await participants.deleteMany(query);
  } catch (err) {
    console.dir(err);
  }
}

setInterval(removeInactiveParticipants, CHECK_INTERVAL);

app.get("/participants", async (req, res) => {
  try {
    const activeParticipants = await participants.find().toArray();
    return res.send(activeParticipants);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/participants", async (req, res) => {
  const { error, value } = participantSchema.validate(req.body);

  if (error) {
    return res.sendStatus(422);
  }

  const name = stripHtml(value.name).result;

  try {
    const existingParticipant = await participants.findOne({ name });

    if (existingParticipant) {
      return res.sendStatus(409);
    }

    await participants.insertOne({ name, lastStatus: Date.now() });
    await messages.insertOne({
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().format("HH:mm:ss"),
    });
    return res.sendStatus(201);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/messages", async (req, res) => {
  const { user: name } = req.headers;
  let limit = req.query.limit;

  if (limit === undefined) {
    limit = 0;
  }

  limit = parseInt(limit);

  if (Number.isNaN(limit) || limit < 0) {
    return res.sendStatus(422);
  }

  try {
    const currentUser = await participants.findOne({ name });

    if (!currentUser) {
      return res.sendStatus(401);
    }

    const query = {
      $or: [{ to: { $in: [name, "Todos"] } }, { from: name }],
    };

    const filteredMessages = await messages.find(query).limit(limit).toArray();

    return res.send(filteredMessages);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/messages", async (req, res) => {
  const { user: from } = req.headers;
  const { error, value } = messageSchema.validate(req.body);
  const { to, text, type } = Object.fromEntries(
    Object.entries(value).map(([key, value]) => [key, stripHtml(value).result])
  );

  if (error) {
    return res.sendStatus(422);
  }

  try {
    const currentUser = participants.find({ name: from });

    if (!currentUser) {
      return res.sendStatus(401);
    }

    const messageTarget = participants.find({ name: to });

    if (!messageTarget) {
      return res.sendStatus(422);
    }

    await messages.insertOne({
      from,
      to,
      text,
      type,
      time: dayjs().format("HH:mm:ss"),
    });

    return res.sendStatus(201);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

const port = 5000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
