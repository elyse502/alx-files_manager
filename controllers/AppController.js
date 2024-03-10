const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');

class AppController {
  static getStatus(req, res) {
    if (redisClient.isAlive() && dbClient.isAlive()) {
      res.status(200).json({ redis: true, db: true });
    }
  }

  static async getStats(req, res) {
    const files = await dbClient.nbFiles();
    const users = await dbClient.nbUsers();
    res.status(200).json({ users, files });
  }
}

module.exports = AppController;
