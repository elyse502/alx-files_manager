import { v4 as uuidv4 } from 'uuid';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';
import { hashPassword } from '../utils/password';

class AuthController {
  static async getConnect(req, res) {
    const token = req.header('Authorization') || null;
    if (!token || token.length === 0) return res.status(401).json({ error: 'Unauthorized' });

    const decodedToken = Buffer.from(token.split(' ')[1], 'base64').toString('utf8');
    const [email, password] = decodedToken.split(':');
    if (!email || !password) return res.status(401).json({ error: 'Unauthorized' });

    const hashedPassword = hashPassword(password);
    const user = await dbClient.db.collection('users').findOne({
      email,
      password: hashedPassword,
    });

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const uuid = uuidv4();
    const key = `auth_${uuid}`;
    await redisClient.set(key, user._id.toString(), 86400);
    return res.status(200).json({ token: uuid });
  }

  static async getDisconnect(req, res) {
    const token = req.header('X-Token') || null;
    if (!token || token.length === 0) return res.status(401).json({ error: 'Unauthorized' });

    const key = `auth_${token}`;
    const user = await redisClient.get(key);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    await redisClient.del(key);

    return res.status(204).send();
  }
}

export default AuthController;
