import dotenv from "dotenv";
import express, { json } from "express";
import cors from "cors";
import { MongoClient } from "mongodb";

dotenv.config();

const app = express();
app.use(cors());
app.use(json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

const port = 5000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
