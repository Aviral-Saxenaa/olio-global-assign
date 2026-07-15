import { syncDatabase } from "./index.js";

await syncDatabase({ alter: true });
console.log("Database synced");
