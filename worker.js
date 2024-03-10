/* eslint-disable linebreak-style */
import fs from 'fs';
import imageThumbnail from 'image-thumbnail';
import Queue from 'bull';
import dbClient from './utils/db';

const fileQueue = new Queue('fileQueue', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
});

const createThumbnails = async (width, localPath) => {
  const thumbnail = await imageThumbnail(localPath, {
    width,
  });
  return thumbnail;
};

fileQueue.process(async (job, done) => {
  const { userId, fileId } = job.data;
  if (!userId) {
    done(new Error('Missing userId'));
  }
  if (!fileId) {
    done(new Error('Missing fileId'));
  }

  const files = dbClient.db.collection('files');
  const file = await files.findOne({ _id: fileId, userId });
  if (!file) {
    done(new Error('File not found'));
  }

  const size500 = await createThumbnails(500, file.localPath);
  const size250 = await createThumbnails(250, file.localPath);
  const size100 = await createThumbnails(100, file.localPath);

  const pathTo500 = `${file.localPath}_500`;
  const pathTo250 = `${file.localPath}_250`;
  const pathTo100 = `${file.localPath}_100`;

  await fs.promises.writeFile(pathTo500, size500);
  await fs.promises.writeFile(pathTo250, size250);
  await fs.promises.writeFile(pathTo100, size100);
});
