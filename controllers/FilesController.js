import { ObjectId } from 'mongodb';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import path from 'path';
import dbClient from '../utils/db';
import fileControllerHelper from '../utils/files';

class FilesController {
  static async postUpload(req, res) {
    const user = await fileControllerHelper.getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const acceptedTypes = ['folder', 'file', 'image'];
    const {
      name,
      type,
      parentId,
      isPublic,
      data,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Missing name' });
    if ((!type || !acceptedTypes.includes(type))) return res.status(400).json({ error: 'Missing type' });
    if (!data && type !== 'folder') return res.status(400).json({ error: 'Missing data' });

    if (parentId) {
      const filesCollection = dbClient.db.collection('files');
      const parent = await filesCollection.findOne({ _id: ObjectId(parentId) });
      if (!parent) return res.status(400).json({ error: 'Parent not found' });
      if (parent.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }
    const fileData = {
      name,
      type,
      parentId: parentId || 0,
      isPublic: isPublic || false,
      userId: user._id.toString(),
    };

    if (type === 'folder') {
      const filesCollection = dbClient.db.collection('files');
      const result = await filesCollection.insertOne(fileData);
      fileData.id = result.insertedId;
      delete fileData._id;
      res.setHeader('Content-Type', 'application/json');
      return res.status(201).json(fileData);
    }
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    const fileName = uuidv4();
    const filePath = path.join(folderPath, fileName);

    fileData.localPath = filePath;
    const decodedData = Buffer.from(data, 'base64');
    const pathExists = await fileControllerHelper.pathExists(folderPath);
    if (!pathExists) {
      await fs.promises.mkdir(folderPath, { recursive: true });
    }
    return fileControllerHelper.writeToFile(res, filePath, decodedData, fileData);
  }

  static async getIndex(req, res) {
    const user = await fileControllerHelper.getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { parentId, page } = req.query;

    const filesCollection = dbClient.db.collection('files');

    const pageNo = page || 1;
    const pageSize = 20;
    const skip = (pageNo - 1) * pageSize;

    const query = !parentId ? { userId: user._id.toString() }
      : { userId: user._id.toString(), parentId };

    const data = await filesCollection.aggregate([
      { $match: query },
      { $skip: skip },
      { $limit: pageSize },
    ]).toArray();

    const response = data.map((file) => {
      const newData = {
        ...file,
        id: file._d,
      };
      delete newData._id;
      delete newData.localPath;
      return newData;
    });
    return res.status(200).json({ response });
  }

  static async getShow(req, res) {
    const user = await fileControllerHelper.getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const filesCollection = dbClient.db.collection('files');
    const file = filesCollection.findOne({ _id: ObjectId(id), userId: user._id });
    if (!file) return res.status(404).json({ error: 'Not found' });

    file.id = file._id;
    delete file._id;
    delete file.localPath;

    return res.status(200).json({ file });
  }

  static async putPublish(req, res) {
    return FilesController.publishOrUnpublish(req, res, true);
  }

  static async putUnpublish(req, res) {
    return FilesController.publishOrUnpublish(req, res, false);
  }

  static async publishOrUnpublish(req, res, isPublic) {
    const user = await fileControllerHelper.getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const filesCollection = dbClient.db.collection('files');
    const file = await filesCollection.findOne({ userId: user._id, _id: ObjectId(id) });
    if (!file) return res.status(404).json({ error: 'Not found' });

    await filesCollection.updateOne({
      _id: ObjectId(id),
    }, {
      $set: {
        isPublic,
      },
    });

    const updatedFile = await filesCollection.findOne({
      _id: ObjectId(id),
    });

    updatedFile.id = updatedFile._id;
    delete updatedFile._id;
    delete updatedFile.localPath;

    return res.status(200).send(updatedFile);
  }

  static async getFile(req, res) {
    const { id } = req.params;
    const { size } = req.query;
    if (!id) return res.status(404).json({ error: 'Not found' });

    const filesCollection = dbClient.db.collection('files');
    const file = await filesCollection.findOne({ _id: ObjectId(id) });
    if (!file) return res.status(404).json({ error: 'Not found' });

    const user = await fileControllerHelper.getUserFromToken(req);
    if (!user && !file.isPublic) return res.status(404).json({ error: 'Not found' });

    if (!file.isPublic && user && file.userId !== user._id.toString()) {
      return res.status(404).json({
        error: 'Not found',
      });
    }
    if (file.type === 'folder') {
      return res.status(400).json({
        error: 'A folder doesn\'t have content',
      });
    }

    const filePath = size && file.type === 'image'
      ? `${file.localPath}_${size}`
      : file.localPath;

    if (!(await fileControllerHelper.pathExists(filePath))) {
      return res.status(404).json({
        error: 'Not found',
      });
    }

    res.set('Content-Type', mime.lookup(file.name));
    return res.status(200).sendFile(filePath);
  }
}

export default FilesController;
