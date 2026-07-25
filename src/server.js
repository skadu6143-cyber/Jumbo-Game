'use strict';

require('dotenv').config();

const http = require('http');
const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || '0.0.0.0';
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb+srv://skadu6143_db_user:TYOsU8lNP3zoc23F@cluster0.jzsgws6.mongodb.net/jumbo_word_game?retryWrites=true&w=majority';


mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log(`✅  MongoDB connected → ${MONGODB_URI}`);
    startServer();
  })
  .catch((err) => {
    console.error('❌  MongoDB connection failed:', err.message);
    process.exit(1);
  });

function startServer() {
  const server = http.createServer(app);

  server.listen(PORT, HOST, () => {
    console.log(`🚀  Server listening on http://${HOST}:${PORT}`);
    console.log(`🩺  Health check → GET http://${HOST}:${PORT}/health`);
  });

  process.on('SIGTERM', () => {
    console.log('🛑  SIGTERM received — shutting down gracefully...');
    server.close(async () => {
      await mongoose.disconnect();
      console.log('👋  Bye!');
      process.exit(0);
    });
  });
}
