import dotenv from "dotenv";
import express, { json } from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import { stripHtml } from "string-strip-html";
import dayjs from "dayjs";
import Joi from "joi";

import participantSchema from "./schemas/participant.js";
import messageSchema from "./schemas/message.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(json());

const uri = process.env.DATABASE_URL;
const client = new MongoClient(uri);
const db = client.db();

const SESSION_TIMEOUT = 10_000;
const CHECK_INTERVAL = 15_000;

app.get("/participants", async (req, res) => {
  try {
    const participants = await db.collection("participants").find().toArray();
    return res.send(participants);
  } catch (err) {
    console.dir(err);
    return res.status(500).send(err.message);
  }
});

app.post("/participants", async (req, res) => {
  const { error, value } = participantSchema.validate(req.body);

  if (error) {
    return res.sendStatus(422);
  }

  const name = stripHtml(value.name).result;

  try {
    const currentUser = await db.collection("participants").findOne({ name });

    if (currentUser) {
      return res.sendStatus(409);
    }

    await db
      .collection("participants")
      .insertOne({ name, lastStatus: Date.now() });

    await db.collection("messages").insertOne({
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().format("HH:mm:ss"),
    });

    return res.sendStatus(201);
  } catch (err) {
    console.dir(err);
    return res.status(500).send(err.message);
  }
});

app.get("/messages", async (req, res) => {
  const { user: from } = req.headers;

  if (from === undefined) {
    return res.sendStatus(422);
  }

  const { limit } = req.query;
  const limitSchema = Joi.number().integer().greater(0);
  const { error, value } = limitSchema.validate(req.query.limit);
  let parsedLimit = value;

  if (error) {
    return res.sendStatus(422);
  }

  if (limit === undefined) {
    parsedLimit = 0;
  }

  try {
    const currentUser = await db
      .collection("participants")
      .findOne({ name: from });

    if (!currentUser) {
      return res.sendStatus(422);
    }

    const query = {
      $or: [{ to: { $in: [from, "Todos"] } }, { from }],
    };

    const messages = await db
      .collection("messages")
      .find(query)
      .limit(parsedLimit)
      .toArray();

    return res.send(messages);
  } catch (err) {
    console.dir(err);
    return res.status(500).send(err.message);
  }
});

app.post("/messages", async (req, res) => {
  const { user: from } = req.headers;
  const { error, value } = messageSchema.validate(req.body);

  if (error) {
    return res.sendStatus(422);
  }

  const { to, text, type } = Object.fromEntries(
    Object.entries(value).map(([key, value]) => [key, stripHtml(value).result])
  );

  try {
    const currentUser = await db
      .collection("participants")
      .findOne({ name: from });

    if (!currentUser) {
      return res.sendStatus(422);
    }

    await db.collection("messages").insertOne({
      from,
      to,
      text,
      type,
      time: dayjs().format("HH:mm:ss"),
    });

    return res.sendStatus(201);
  } catch (err) {
    console.dir(err);
    return res.status(500).send(err.message);
  }
});

app.delete("/messages/:id", async (req, res) => {
  const { id } = req.params;
  const { user: from } = req.headers;

  if (from === undefined) {
    return res.sendStatus(422);
  }

  try {
    const message = await db
      .collection("messages")
      .findOne({ _id: new ObjectId(id) });

    if (!message) {
      return res.sendStatus(404);
    }

    if (from !== message.from) {
      return res.sendStatus(401);
    }

    await db.collection("messages").deleteOne({ _id: new ObjectId(id) });
    return res.sendStatus(200);
  } catch (err) {
    console.dir(err);
    return res.status(500).send(err.message);
  }
});

app.put("/messages/:id", async (req, res) => {
  const { id } = req.params;
  const { user: from } = req.headers;

  if (from === undefined) {
    return res.sendStatus(422);
  }

  const { error, value } = messageSchema.validate(req.body);

  if (error) {
    return res.sendStatus(422);
  }

  const updatedMessage = Object.fromEntries(
    Object.entries(value).map(([key, value]) => [key, stripHtml(value).result])
  );

  try {
    const message = await db
      .collection("messages")
      .findOne({ _id: new ObjectId(id) });

    if (!message) {
      return res.sendStatus(404);
    }

    if (from !== message.from) {
      return res.sendStatus(401);
    }

    await db
      .collection("messages")
      .updateOne({ _id: new ObjectId(id) }, { $set: updatedMessage });

    return res.sendStatus(200);
  } catch (err) {
    console.dir(err);
    return res.status(500).send(err.message);
  }
});

app.post("/status", async (req, res) => {
  const { user: name } = req.headers;
  const now = Date.now();

  if (name === undefined) {
    return res.sendStatus(404);
  }

  try {
    const { matchedCount } = await db
      .collection("participants")
      .updateOne({ name }, { $set: { lastStatus: now } });

    if (matchedCount === 0) {
      return res.sendStatus(404);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.dir(err);
    return res.status(500).send(err.message);
  }
});

const port = 5000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

async function removeInactiveParticipants() {
  const now = Date.now();
  const leastAllowedTimestamp = now - SESSION_TIMEOUT;
  const query = { lastStatus: { $lt: leastAllowedTimestamp } };

  try {
    const inactiveParticipants = await db
      .collection("participants")
      .find(query)
      .toArray();

    if (inactiveParticipants.length === 0) {
      return;
    }

    const messages = inactiveParticipants.map(({ name }) => ({
      from: name,
      to: "Todos",
      text: "sai da sala...",
      type: "status",
      time: dayjs(now).format("HH:mm:ss"),
    }));

    await db.collection("messages").insertMany(messages);
    await db.collection("participants").deleteMany(query);
  } catch (err) {
    console.dir(err);
  }
}

setInterval(removeInactiveParticipants, CHECK_INTERVAL);
