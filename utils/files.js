/* eslint-disable linebreak-style */
import { ObjectId } from 'mongodb';
import fs from 'fs';
import Queue from 'bull';
import redisClient from './redis';
import dbClient from './db';

const fileQueue = new Queue('fileQueue', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
});

class FileControllerHelper {
  static async getUserFromToken(req) {
    const authToken = req.header('X-Token') || null;
    if (!authToken) return null;

    const key = `auth_${authToken}`;
    const user = await redisClient.get(key);
    if (!user) return null;

    const userCollection = dbClient.db.collection('users');
    const dbUser = await userCollection.findOne({ _id: ObjectId(user) });
    if (!dbUser) return null;
    return dbUser;
  }

  static pathExists(path) {
    return new Promise((resolve) => {
      fs.access(path, fs.constants.F_OK, (error) => {
        resolve(!error);
      });
    });
  }

  static async writeToFile(res, filePath, data, fileData) {
    await fs.promises.writeFile(filePath, data, 'utf-8');

    const filesCollection = dbClient.db.collection('files');
    const result = await filesCollection.insertOne(fileData);

    const response = {
      ...fileData,
      id: result.insertedId,
    };

    delete response._id;
    delete response.localPath;

    if (response.type === 'image') {
      fileQueue.add({ userId: response.userId, fileId: response.id });
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(201).json(response);
  }
}

export default FileControllerHelper;
