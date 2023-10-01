import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ObjectID } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async retrieveUserId(token) {
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (userId) {
      const users = dbClient.db.collection('users');
      const idObject = new ObjectID(userId);
      const user = await users.findOne({ _id: idObject });
      if (!user) {
        return null;
      }
      return user;
    }
    return null;
  }

  static async postUpload(req, res) {
    const { token } = req.headers;
    const {
      name, type, parentId, isPublic, data,
    } = req.body;

    // Retrieve the user based on the token
    const userId = await FilesController.retrieveUserId(token); // Corrected function call
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate request parameters
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if ((type !== 'folder') && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // Handle parentId validation
    let parentFile;
    if (parentId) {
      parentFile = await dbClient.db.collection('files').findOne({ _id: parentId });
      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    // Create local storing folder path
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    const filePath = path.join(folderPath, uuidv4());

    // Decode and store file content locally
    if (type !== 'folder') {
      const fileBuffer = Buffer.from(data, 'base64');
      fs.writeFileSync(filePath, fileBuffer);
    }

    // Create new file document
    const newFile = {
      userId,
      name,
      type,
      isPublic: !!isPublic,
      parentId: parentId || 0,
      localPath: filePath,
    };

    // Add the new file document to the collection
    const result = await dbClient.db.collection('files').insertOne(newFile);

    // Return the new file with a status code 201
    const fileId = result.insertedId;
    const responseFile = { ...newFile, _id: fileId };
    return res.status(201).json(responseFile);
  }
}

module.exports = FilesController;
