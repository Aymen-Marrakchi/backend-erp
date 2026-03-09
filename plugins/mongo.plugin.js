const fp = require("fastify-plugin");
const mongoose = require("mongoose");

async function mongoPlugin(fastify, options) {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not set in environment variables");
  }

  try {
    // Keep DB connection timeout below Fastify plugin timeout to avoid FST_ERR_PLUGIN_TIMEOUT.
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    fastify.log.info(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    fastify.log.error(`MongoDB connection error: ${error.message}`);
    throw error;
  }

  fastify.addHook("onClose", async () => {
    await mongoose.connection.close();
    fastify.log.info("MongoDB connection closed");
  });
}

module.exports = fp(mongoPlugin);
