import { BigrockServer } from './BigrockServer.js';
function main() {
    const port = parseInt(process.env.PORT || '11500', 10);
    const server = new BigrockServer(port);
    server.start();
}
main();
