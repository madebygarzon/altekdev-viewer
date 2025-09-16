// Comments in English inside code as requested.
import 'dotenv/config';
import express from "express";
import cors from "cors";
import { router } from "./routes.js";

const app = express();

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN?.split(",") ?? "*"
}));
app.use(express.json());
app.use("/api", router);

app.get("/", (_req, res) => {
  res.send("ALTEKDev API is running. Use /api/ping /api/tables /api/inv-items /api/test-insert");
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
