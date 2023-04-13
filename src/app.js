import dotenv from "dotenv";
import express, { json } from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { stripHtml } from "string-strip-html";
import dayjs from "dayjs";

import participantSchema from "./schemas/participant.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
const db = client.db();

app.get("/participants", async (req, res) => {
  try {
    const participants = await db.collection("participants").find().toArray();
    return res.send(participants);
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
    const participants = db.collection("participants");
    const messages = db.collection("messages");

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

const port = 5000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
