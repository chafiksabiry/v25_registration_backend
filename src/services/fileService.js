import fs from 'fs/promises';
import fileRepository from '../repositories/fileRepository.js';

export class FileService {
  async uploadFile(file, userId, metadata = {}) {
    if (!file) {
      throw new Error('No file provided');
    }

    return fileRepository.create({
      name: file.originalname,
      size: file.size,
      type: file.mimetype,
      path: file.path,
      uploadedBy: userId,
      metadata
    });
  }

  async getFiles(userId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    return fileRepository.findByUser(userId, { skip, limit });
  }

  async deleteFile(fileId, userId) {
    const file = await fileRepository.findOne({
      _id: fileId,
      uploadedBy: userId
    });

    if (!file) {
      throw new Error('File not found');
    }

    await fs.unlink(file.path);
    await fileRepository.delete(fileId);

    return { message: 'File deleted successfully' };
  }

  async togglePublicAccess(fileId, userId) {
    const file = await fileRepository.findOne({
      _id: fileId,
      uploadedBy: userId
    });

    if (!file) {
      throw new Error('File not found');
    }

    return fileRepository.update(fileId, {
      isPublic: !file.isPublic
    });
  }

  async exportFiles(userId) {
    const files = await fileRepository.findByUser(userId, {});
    
    const exportData = files.map(file => ({
      id: file._id,
      name: file.name,
      size: file.size,
      type: file.type,
      isPublic: file.isPublic,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      metadata: file.metadata
    }));

    return {
      exportedAt: new Date(),
      totalFiles: files.length,
      files: exportData
    };
  }
}

export default new FileService();