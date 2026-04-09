const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // These are the recommended options for Atlas
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS:          45000,
    });

    isConnected = true;
    console.log(`✓ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('✗ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed (SIGINT)');
  process.exit(0);
});

module.exports = connectDB;
