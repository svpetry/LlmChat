import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { router } from "./routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 8000;

app.use(express.json());
app.use(router);

const staticDir = join(__dirname, "..", "..", "dist");
app.use(express.static(staticDir));
app.get("*", (_req, res) => {
    res.sendFile(join(staticDir, "index.html"));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
