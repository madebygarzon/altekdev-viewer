// Comments in English inside code as requested.
import 'dotenv/config';
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { router } from "./routes.js";
const app = express();
app.use(cors({
    origin: process.env.ALLOWED_ORIGIN?.split(",") ?? "*"
}));
app.use(express.json());
app.use("/api", router);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(currentDir, "../web");
app.use(express.static(webDir));
app.get("/", (_req, res) => {
    res.sendFile(path.join(webDir, "index.html"));
});
app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
        return next();
    }
    res.sendFile(path.join(webDir, "index.html"));
});
const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});
