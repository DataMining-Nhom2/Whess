import { io } from "socket.io-client";

const socket = io('localhost:3000'); // initialize websocket connection

export default socket;