import 'dotenv/config';
import http from "node:http";
import { createServerApplication } from "./app/index.js";

async function main() {
  try {
    // aapne server node se bnaya lekin handler express ka pass kar diya hai jo routes handle karega so yha pe kuch bhi ho skta hai express bun
    const server = http.createServer(createServerApplication());

    //#region *// =================== PORT =================

    // const port: number = process.env.PORT ?? 8080;  //agar env me port variable hai toh wo use karo nahi to 8080 use karlo, PORT = undefned bhi to ho skta hai so now

    // const port: number = process.env.PORT ? +process.env.PORT : 8080; // agar process.env.port me port hai to typecast karo number me nahi to by default 8080 use karlo
    //but isme bhi ek bug hai => PORT ki value "ANKIT" hai to +ANKIT = NaN not a number => menaing no validation is being performed

    const PORT: number = process.env.PORT ? +process.env.PORT : 8080;

    //#endregion ===============   PORT         ==============
    
    server.listen(PORT, () => {
      console.log(`Server is listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    throw error;
  }
}

main();
