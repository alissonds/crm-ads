const { createClient } = require('redis');

let client = null;

async function getRedisClient() {
  if (client) return client;

  client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || undefined,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
    },
  });

  client.on('error', (err) => console.error('Redis error:', err));
  client.on('connect', () => console.log('Redis conectado'));

  await client.connect();
  return client;
}

async function get(key) {
  const redis = await getRedisClient();
  const val = await redis.get(key);
  return val ? JSON.parse(val) : null;
}

async function set(key, value, ttlSeconds = 3600) {
  const redis = await getRedisClient();
  await redis.setEx(key, ttlSeconds, JSON.stringify(value));
}

async function del(key) {
  const redis = await getRedisClient();
  await redis.del(key);
}

async function incr(key) {
  const redis = await getRedisClient();
  return redis.incr(key);
}

module.exports = { getRedisClient, get, set, del, incr };
