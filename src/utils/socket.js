import io from 'socket.io-client';

const URL = import.meta.env.MODE === 'development'
    ? "http://localhost:3001"
    : window.location.origin;

const socket = io(URL);

export default socket;
